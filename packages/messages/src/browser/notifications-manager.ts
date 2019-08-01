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
import { MessageClient, MessageType, Message as PlainMessage, ProgressMessage, ProgressUpdate, CancellationToken } from '@theia/core/lib/common';
import { deepClone } from '@theia/core/lib/common/objects';
import { Event, Emitter } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Md5 } from 'ts-md5';
import * as markdownit from 'markdown-it';
import throttle = require('lodash.throttle');
import { NotificationPreferences } from './notification-preferences';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';

export const NotificationManager = Symbol('NotificationManager');
export interface NotificationManager {
    readonly open: boolean;
    readonly onUpdate: Event<NotificationManager.UpdateEvent>;
    accept(notification: Notification | string, action: string): Promise<void>;
    hide(): Promise<void>;
    toggle(): Promise<void>;
    clear(notification: Notification | string): Promise<void>;
    clearAll(): Promise<void>;
    toggleExpansion(notification: string): Promise<void>;
    openLink(link: string): Promise<void>;
}
export namespace NotificationManager {
    export interface UpdateEvent {
        readonly notifications: Notification[];
        readonly open: boolean;
    }
}

export interface Notification {
    messageId: string;
    message: string;
    source?: string;
    expandable: boolean;
    collapsed: boolean;
    type: 'info' | 'warning' | 'error' | 'progress';
    actions: string[];
    progress?: number;
}

@injectable()
export class NotificationManagerImpl extends MessageClient implements NotificationManager {

    @inject(NotificationPreferences)
    protected readonly preferences: NotificationPreferences;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected readonly onUpdateEmitter = new Emitter<NotificationManager.UpdateEvent>();
    protected readonly fireUpdateEvent = throttle(() => {
        const notifications = deepClone(Array.from(this.notifications.values()));
        this.onUpdateEmitter.fire({ notifications, open: this.open });
    }, 250, { leading: false });
    readonly onUpdate = this.onUpdateEmitter.event;

    protected readonly resultPromises = new Map<string, Deferred<string | undefined>>();
    protected readonly notifications = new Map<string, Notification>();

    protected notificationToastsVisibleKey: ContextKey<boolean>;
    protected notificationCenterVisibleKey: ContextKey<boolean>;

    @postConstruct()
    protected async init() {
        this.notificationToastsVisibleKey = this.contextKeyService.createKey<boolean>('notificationToastsVisible', false);
        this.notificationCenterVisibleKey = this.contextKeyService.createKey<boolean>('notificationCenterVisible', false);
    }
    protected updaetContextKeys() {
        this.notificationToastsVisibleKey.set(this.openState);
        this.notificationCenterVisibleKey.set(this.openState);
    }

    protected openState = false;
    get open(): boolean {
        return this.openState;
    }

    async hide(): Promise<void> {
        this.openState = false;
        this.fireUpdateEvent();
    }
    async toggle(): Promise<void> {
        this.openState = !this.openState;
        this.fireUpdateEvent();
    }

    async accept(notification: Notification | string, action: string | undefined): Promise<void> {
        const messageId = this.getId(notification);
        if (!messageId) {
            return;
        }
        this.notifications.delete(messageId);
        const result = this.resultPromises.get(messageId);
        if (!result) {
            return;
        }
        this.resultPromises.delete(messageId);
        result.resolve(action);
        if (this.notifications.size === 0) {
            this.openState = false;
        }
        this.fireUpdateEvent();
    }
    protected find(notification: Notification | string) {
        return typeof notification === 'string' ? this.notifications.get(notification) : notification;
    }
    protected getId(notification: Notification | string) {
        return typeof notification === 'string' ? notification : notification.messageId;
    }

    async clearAll() {
        this.openState = false;
        this.fireUpdateEvent();
        await Promise.all(Array.from(this.notifications.values()).map(n => this.clear(n)));
    }

    async clear(notification: Notification | string) {
        await this.accept(notification, undefined);
    }

    async toggleExpansion(notificationId: string) {
        const notification = this.find(notificationId);
        if (!notification) {
            return;
        }
        notification.collapsed = !notification.collapsed;
        this.fireUpdateEvent();
    }

    showMessage(plainMessage: PlainMessage): Promise<string | undefined> {
        const messageId = this.getMessageId(plainMessage);
        let result = this.resultPromises.get(messageId);
        if (result) {
            return result.promise;
        }
        result = new Deferred<string | undefined>();
        this.resultPromises.set(messageId, result);

        const message = this.renderMessage(plainMessage.text);
        const type = this.toNotificationType(plainMessage.type);
        const actions = Array.from(new Set(plainMessage.actions));
        const source = plainMessage.source;
        const expandable = this.isExpandable(message, source, actions);
        const collapsed = expandable;
        this.notifications.set(messageId, {
            messageId, message, type, actions, expandable, collapsed
        });
        this.openState = true;
        this.fireUpdateEvent();
        if (actions.length === 0) {
            const timeout = plainMessage.options && plainMessage.options.timeout || this.preferences['notification.timeout'];
            if (timeout > 0) {
                window.setTimeout(() => {
                    this.clear(messageId);
                }, timeout);
            }
        }
        return result.promise;
    }
    protected readonly mdEngine = markdownit({ html: true });
    protected renderMessage(content: string) {
        const contentWithoutNewlines = content.replace(/(\r)?\n/gm, ' ');
        return this.mdEngine.renderInline(contentWithoutNewlines);
    }
    protected isExpandable(message: string, source: string | undefined, actions: string[]) {
        if (!actions.length && source) {
            return true;
        }
        return message.length > 500;
    }
    protected toNotificationType(type?: MessageType) {
        switch (type) {
            case MessageType.Error:
                return 'error';
            case MessageType.Warning:
                return 'warning';
            case MessageType.Progress:
                return 'progress';
            default:
                return 'info';
        }
    }
    protected getMessageId(m: PlainMessage): string {
        return String(Md5.hashStr(`[${m.type}] ${m.text} : ${(m.actions || []).join(' | ')};`));
    }

    async showProgress(messageId: string, plainMessage: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        let result = this.resultPromises.get(messageId);
        if (result) {
            return result.promise;
        }
        result = new Deferred<string | undefined>();
        this.resultPromises.set(messageId, result);

        const message = this.renderMessage(plainMessage.text);
        const type = this.toNotificationType(plainMessage.type);
        const actions = Array.from(new Set(plainMessage.actions));
        const source  = plainMessage.source;
        const expandable = this.isExpandable(message, source, actions);
        const collapsed = expandable;
        this.notifications.set(messageId, {
            messageId, message, type, actions, expandable, collapsed, progress: 0
        });
        this.openState = true;
        this.fireUpdateEvent();

        cancellationToken.onCancellationRequested(() => {
            this.accept(messageId, ProgressMessage.Cancel);
        });
        return result.promise;
    }

    async reportProgress(messageId: string, update: ProgressUpdate, plainMessage: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        const notification = this.find(messageId);
        if (!notification) {
            return;
        }
        if (cancellationToken.isCancellationRequested) {
            this.clear(messageId);
        } else {
            notification.message = update.message || notification.message;
            notification.progress = this.toPlainProgress(update);
        }
        this.fireUpdateEvent();
    }
    protected toPlainProgress(update: ProgressUpdate) {
        return update.work && Math.round(update.work.done / update.work.total * 100);
    }

    async openLink(link: string) {
        const uri = new URI(link);
        const opener = await this.openerService.getOpener(uri);
        opener.open(uri);
    }

}
