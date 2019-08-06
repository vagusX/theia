/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { inject, injectable, postConstruct } from 'inversify';
import {
    ApplyToKind, FileLocationKind, NamedProblemMatcher, Severity,
    ProblemPattern, ProblemMatcher, ProblemMatcherContribution, WatchingMatcher
} from '../common';
import { ProblemPatternRegistry } from './task-problem-pattern-registry';

@injectable()
export class ProblemMatcherRegistry {

    private matchers: { [name: string]: NamedProblemMatcher };
    private readyPromise: Promise<void>;

    @inject(ProblemPatternRegistry)
    protected readonly problemPatternRegistry: ProblemPatternRegistry;

    @postConstruct()
    protected init() {
        // tslint:disable-next-line:no-null-keyword
        this.matchers = Object.create(null);
        this.problemPatternRegistry.onReady().then(() => {
            this.fillDefaults();
            this.readyPromise = new Promise<void>((res, rej) => res(undefined));
        });
    }

    onReady(): Promise<void> {
        return this.readyPromise;
    }

    /**
     * Add a problem matcher to the registry.
     *
     * @param definition the problem matcher to be added.
     */
    async register(matcher: ProblemMatcherContribution): Promise<void> {
        if (!matcher.name) {
            console.error('Only named Problem Matchers can be registered.');
            return;
        }
        const problemMatcher = await this.getProblemMatcherFromContribution(matcher);
        this.add(problemMatcher as NamedProblemMatcher);
    }

    /**
     * Finds the problem matcher from the registry by its name.
     *
     * @param name the name of the problem matcher
     * @return the problem matcher. If the task definition is not found, `undefined` is returned.
     */
    get(name: string): NamedProblemMatcher | undefined {
        if (name.startsWith('$')) {
            return this.matchers[name.slice(1)];
        }
        return this.matchers[name];
    }

    /**
     * Returns all registered problem matchers in the registry.
     */
    getAll(): NamedProblemMatcher[] {
        const all: NamedProblemMatcher[] = [];
        for (const matcherName of Object.keys(this.matchers)) {
            all.push(this.get(matcherName)!);
        }
        return all;
    }

    /**
     * Transforms the `ProblemMatcherContribution` to a `ProblemMatcher`
     *
     * @return the problem matcher
     */
    async getProblemMatcherFromContribution(matcher: ProblemMatcherContribution): Promise<ProblemMatcher> {
        const { fileLocation, filePrefix } = this.getFileLocationKindAndPrefix(matcher);
        const patterns: ProblemPattern[] = [];
        if (matcher.pattern) {
            if (typeof matcher.pattern === 'string') {
                await this.problemPatternRegistry.onReady();
                const registeredPattern = this.problemPatternRegistry.get(matcher.pattern);
                if (Array.isArray(registeredPattern)) {
                    patterns.push(...registeredPattern);
                } else if (!!registeredPattern) {
                    patterns.push(registeredPattern);
                }
            } else if (Array.isArray(matcher.pattern)) {
                patterns.push(...matcher.pattern.map(p => ProblemPattern.fromProblemPatternContribution(p)));
            } else {
                patterns.push(ProblemPattern.fromProblemPatternContribution(matcher.pattern));
            }
        }
        const problemMatcher = {
            name: matcher.name,
            label: matcher.label,
            deprecated: matcher.deprecated,
            owner: matcher.owner,
            source: matcher.source,
            applyTo: ApplyToKind.fromString(matcher.applyTo) || ApplyToKind.allDocuments,
            fileLocation,
            filePrefix,
            pattern: patterns,
            severity: Severity.fromValue(matcher.severity),
            watching: WatchingMatcher.fromWatchingMatcherContribution(matcher.background || matcher.watching)
        };
        return problemMatcher;
    }

    private add(matcher: NamedProblemMatcher): void {
        this.matchers[matcher.name] = matcher;
    }

    private getFileLocationKindAndPrefix(matcher: ProblemMatcherContribution): { fileLocation: FileLocationKind, filePrefix: string } {
        let fileLocation = FileLocationKind.Relative;
        let filePrefix = '${workspaceFolder}';
        if (matcher.fileLocation !== undefined) {
            if (Array.isArray(matcher.fileLocation)) {
                if (matcher.fileLocation.length > 0) {
                    const locationKind = FileLocationKind.fromString(matcher.fileLocation[0]);
                    if (matcher.fileLocation.length === 1 && locationKind === FileLocationKind.Absolute) {
                        fileLocation = locationKind;
                    } else if (matcher.fileLocation.length === 2 && locationKind === FileLocationKind.Relative && matcher.fileLocation[1]) {
                        fileLocation = locationKind;
                        filePrefix = matcher.fileLocation[1];
                    }
                }
            } else {
                const locationKind = FileLocationKind.fromString(matcher.fileLocation);
                if (locationKind) {
                    fileLocation = locationKind;
                    if (locationKind === FileLocationKind.Relative) {
                        filePrefix = '${workspaceFolder}';
                    }
                }
            }
        }
        return { fileLocation, filePrefix };
    }

    // copied from https://github.com/Microsoft/vscode/blob/1.33.1/src/vs/workbench/contrib/tasks/common/problemMatcher.ts
    private fillDefaults(): void {
        this.add({
            name: 'msCompile',
            label: 'Microsoft compiler problems',
            owner: 'msCompile',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: (this.problemPatternRegistry.get('msCompile'))!
        });

        this.add({
            name: 'lessCompile',
            label: 'Less problems',
            deprecated: true,
            owner: 'lessCompile',
            source: 'less',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: (this.problemPatternRegistry.get('lessCompile'))!,
            severity: Severity.Error
        });

        this.add({
            name: 'gulp-tsc',
            label: 'Gulp TSC Problems',
            owner: 'typescript',
            source: 'ts',
            applyTo: ApplyToKind.closedDocuments,
            fileLocation: FileLocationKind.Relative,
            filePrefix: '${workspaceFolder}',
            pattern: (this.problemPatternRegistry.get('gulp-tsc'))!
        });

        this.add({
            name: 'jshint',
            label: 'JSHint problems',
            owner: 'jshint',
            source: 'jshint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: (this.problemPatternRegistry.get('jshint'))!
        });

        this.add({
            name: 'jshint-stylish',
            label: 'JSHint stylish problems',
            owner: 'jshint',
            source: 'jshint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: (this.problemPatternRegistry.get('jshint-stylish'))!
        });

        this.add({
            name: 'eslint-compact',
            label: 'ESLint compact problems',
            owner: 'eslint',
            source: 'eslint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            filePrefix: '${workspaceFolder}',
            pattern: (this.problemPatternRegistry.get('eslint-compact'))!
        });

        this.add({
            name: 'eslint-stylish',
            label: 'ESLint stylish problems',
            owner: 'eslint',
            source: 'eslint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: (this.problemPatternRegistry.get('eslint-stylish'))!
        });

        this.add({
            name: 'go',
            label: 'Go problems',
            owner: 'go',
            source: 'go',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Relative,
            filePrefix: '${workspaceFolder}',
            pattern: (this.problemPatternRegistry.get('go'))!
        });
    }
}
