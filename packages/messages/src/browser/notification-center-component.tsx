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

import * as React from 'react';
import { DisposableCollection } from '@theia/core';
import { NotificationManager, Notification } from './notifications-manager';

const PerfectScrollbar = require('react-perfect-scrollbar');

export interface NotificationCenterComponentProps {
    readonly manager: NotificationManager;
}

interface NotificationCenterComponentState extends NotificationManager.UpdateEvent { }

export class NotificationCenterComponent extends React.Component<NotificationCenterComponentProps, NotificationCenterComponentState> {

    constructor(props: NotificationCenterComponentProps) {
        super(props);
        this.state = {
            notifications: [],
            open: false
        };
    }

    protected readonly toDisposeOnUnmount = new DisposableCollection();

    async componentDidMount(): Promise<void> {
        this.toDisposeOnUnmount.push(
            this.props.manager.onUpdate(event => {
                this.setState({
                    notifications: event.notifications.filter(n => n.location === 'notification'),
                    open: event.open
                });
            })
        );
    }
    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    render(): React.ReactNode {
        const empty = this.state.notifications.length === 0;
        const showHeader = empty ? { display: 'flex' } : {};
        const title = empty ? 'NO NOTIFICATIONS' : 'NOTIFICATIONS';
        return (
            <div className={`theia-notification-center ${this.state.open ? 'open' : 'closed'}`}>
                <div className='theia-notification-center-header' style={showHeader}>
                    <div className='theia-notification-center-header-title'>{title}</div>
                    <div className='theia-notification-center-header-actions'>
                        <ul className='theia-notification-actions'>
                            <li className='collapse' title='Hide' onClick={this.onHide.bind(this)} />
                            <li className='clear' title='Clear All' onClick={this.onClearAll.bind(this)} />
                        </ul>
                    </div>
                </div>
                <PerfectScrollbar className='theia-notification-list-scroll-container'>
                    <div className='theia-notification-list'>
                        {this.state.notifications.map(notification => this.renderNotification(notification))}
                    </div>
                </PerfectScrollbar>
            </div>
        );
    }

    protected onHide(): void {
        this.props.manager.hide();
    }

    protected onClearAll(): void {
        this.props.manager.clearAll();
    }

    protected onClear(messageId: string): void {
        this.props.manager.clear(messageId);
    }

    protected onToggleExpansion(messageId: string): void {
        this.props.manager.toggleExpansion(messageId);
    }

    protected onAction(messageId: string, action: string): void {
        this.props.manager.accept(messageId, action);
    }

    protected messageClickeHandler(event: React.MouseEvent): void {
        if (event.target instanceof HTMLAnchorElement) {
            event.stopPropagation();
            event.preventDefault();
            const link = event.target.href;
            this.props.manager.openLink(link);
        }
    }

    protected renderNotification(notification: Notification): React.ReactNode {
        const { messageId, message, type, progress, collapsed, expandable } = notification;
        return (<div key={messageId} className='theia-notification-list-item'>
            <div className={`theia-notification-list-item-content ${collapsed ? 'collapsed' : ''}`}>
                <div className='theia-notification-list-item-content-main'>
                    <div className={`theia-notification-icon theia-notification-icon-${type}`} />
                    <div className='theia-notification-message'>
                        <span dangerouslySetInnerHTML={{ __html: message }} onClick={this.messageClickeHandler.bind(this)} />
                    </div>
                    <ul className='theia-notification-actions'>
                        {expandable && (
                            <li className={collapsed ? 'expand' : 'collapse'} title={collapsed ? 'Expand' : 'Collapse'} onClick={() => this.onToggleExpansion(messageId)} />
                        )}
                        <li className='clear' title='Clear' onClick={() => this.onClear(messageId)} />
                    </ul>
                </div>
                <div className='theia-notification-list-item-content-bottom'>
                    <div className='theia-notification-source'>
                        {notification.source && (<span>{notification.source}</span>)}
                    </div>
                    <div className='theia-notification-buttons'>
                        {notification.actions && notification.actions.map((action, index) => (
                            <button key={messageId + `-action-${index}`} className='theia-button'
                                onClick={() => this.onAction(messageId, action)}>
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {typeof progress === 'number' && (
                <div className='theia-notification-item-progress'>
                    <div className='theia-notification-item-progressbar' style={{ width: `${progress}%` }} />
                </div>
            )}
        </div>);
    }

}
