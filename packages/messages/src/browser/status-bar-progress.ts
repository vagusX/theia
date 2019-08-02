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

import { injectable, inject, postConstruct } from 'inversify';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { NotificationManager, Notification } from './notifications-manager';

@injectable()
export class StatusBarProgress {

    protected readonly id = 'theia-progress-status-bar-item';

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @postConstruct()
    protected init(): void {
        this.manager.onUpdate(event => {
            this.process(event.notifications.filter(n => n.location === 'window'));
        });
    }
    protected queue: string[] = [];
    protected process(notifications: Notification[]): void {
        const newIds = notifications.map(n => n.messageId).filter(id => this.queue.indexOf(id) === -1);
        this.queue.push(...newIds);
        let notification: Notification | undefined;
        while (!notification && this.queue.length > 0) {
            const pick = this.queue[this.queue.length - 1];
            notification = notifications.find(n => n.messageId === pick);
            if (!notification) {
                this.queue.pop();
            }
        }
        this.update(notification);
    }

    protected update(notification: Notification | undefined): void {
        if (!notification) {
            this.statusBar.removeElement(this.id);
            return;
        }
        const text = `$(refresh~spin) ${notification.message}`;
        this.statusBar.setElement(this.id, {
            text,
            alignment: StatusBarAlignment.LEFT,
            priority: 1
        });
    }

}
