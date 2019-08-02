/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import {
    FrontendApplicationContribution, StatusBar, FrontendApplication, StatusBarAlignment, KeybindingContribution, KeybindingRegistry, KeybindingContext, Keybinding
} from '@theia/core/lib/browser';
import { NotificationsCommands } from './notifications-commands';
import { CommandContribution, CommandRegistry } from '@theia/core';
import { NotificationManager } from './notifications-manager';
import { NotificationCenter } from './notification-center';
import { StatusBarProgress } from './status-bar-progress';

@injectable()
export class NotificationsContribution implements FrontendApplicationContribution, CommandContribution, KeybindingContribution {

    protected readonly id = 'theia-notification-center';

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @inject(NotificationCenter)
    protected readonly notificationsCenter: NotificationCenter; // required for initialization

    @inject(StatusBarProgress)
    protected readonly statusBarProgress: StatusBarProgress; // required for initialization

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(_app: FrontendApplication): void {
        this.createStatusBarItem();
    }

    protected createStatusBarItem(): void {
        this.updateStatusBarItem();
        this.manager.onUpdate(e => this.updateStatusBarItem(e.notifications.filter(n => n.location === 'notification').length));
    }
    protected updateStatusBarItem(count: number = 0): void {
        this.statusBar.setElement(this.id, {
            text: this.getStatusBarItemText(count),
            alignment: StatusBarAlignment.RIGHT,
            priority: 10,
            command: NotificationsCommands.TOGGLE.id
        });
    }
    protected getStatusBarItemText(count: number): string {
        return `$(bell) ${count ? ` ${count}` : '' }`;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotificationsCommands.TOGGLE, {
            isEnabled: () => true,
            execute: () => this.manager.toggle()
        });
        commands.registerCommand(NotificationsCommands.CLEAR_ALL, {
            execute: () => this.manager.clearAll()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: NotificationsCommands.TOGGLE.id,
            context: NotificationsKeybindingContext.notificationCenterOpened,
            keybinding: 'esc'
        });
    }
}

@injectable()
export class NotificationsKeybindingContext implements KeybindingContext {

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    readonly id = NotificationsKeybindingContext.notificationCenterOpened;
    isEnabled(_arg: Keybinding): boolean {
        return this.manager.open;
    }

}
export namespace NotificationsKeybindingContext {
    export const notificationCenterOpened = 'notificationCenterOpened';
}
