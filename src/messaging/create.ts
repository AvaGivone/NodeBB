import meta from '../meta';
import plugins from '../plugins';
import db from '../database';
import user from '../user';
import { notifyUsersInRoom } from '../notifications';
import { isUserInRoom } from './rooms';
import { markUnread } from './unread';
import { getMessagesData } from './data';
import { isNewSet } from './index';


/*  eslint-disable max-len */

interface MessagingConfig {
    // sendMessage: (data: { content: string; uid: string; roomId: string }) => Promise<void>;
    checkContent: (content: string) => Promise<void>;
    isUserInRoom: (uid: string, roomId: string) => Promise<boolean>;
    addMessage: (data: { content: string, uid: string, roomId: string, system: number}) => Promise<string>;
    addRoomToUsers: (roomId: string, uids:string[], timestamp:number) => Promise<string[]>;
    addMessageToUsers: (roomId: string, uids:string[], mid:number, timestamp:number) => Promise<void>;
    markUnread: (uids: string[], roomId: string) => Promise<void>;
    getMessagesData: (mid: string[], uid: string, roomId: string, isOwner: boolean) => Promise<string>;
    addSystemMessage: (content: string, uid: string, roomId: string) => Promise<void>;
}

interface CustomData {
    content: string,
    uid: string,
    roomId: string,
    system: number,
    ip?: number,
    timestamp?: number,
}

export = function (Messaging: MessagingConfig) {
    async function checkContent(content: string) {
        if (!content) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        const maximumChatMessageLength = meta.config.maximumChatMessageLength as number || 1000 as number;
        content = String(content).trim();
        let { length } = content;
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        ({ content, length } = await plugins.hooks.fire('filter:messaging.checkContent', { content, length }));
        if (!content) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        if (length > maximumChatMessageLength) {
            throw new Error(`[[error:chat-message-too-long, ${maximumChatMessageLength}]]`);
        }
    }

    async function sendMessage(data: CustomData) {
        await checkContent(data.content);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const inRoom: boolean = await isUserInRoom(data.uid, data.roomId);
        if (!inRoom) {
            throw new Error('[[error:not-allowed]]');
        }

        return await addMessage(data);
    }



    async function addMessage(data: CustomData){
    // The next line calls a function in a module that has not been updated to TS yet
    //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const mid = await db.incrObjectField('global', 'nextMid');
        const timestamp = data.timestamp || Date.now();
        let message = {
            content: data.content,
            timestamp: data.timestamp,
            fromuid: data.uid,
            roomId: data.roomId,
            deleted: 0,
            system: data.system || 0,
            ip: null,
        };

        if (data.ip) {
            message.ip = data.ip;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        message = await plugins.hooks.fire('filter:messaging.save', message);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions
        await db.setObject(`message:${mid}`, message);
        const isNewSetTemp:boolean = await isNewSet(data.uid, data.roomId, timestamp);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        let uids = await db.getSortedSetRange(`chat:room:${data.roomId}:uids`, 0, -1);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        uids = await user.blocks.filterUids(data.uid, uids);

        await Promise.all([
            addRoomToUsers(data.roomId, uids, timestamp),
            addMessageToUsers(data.roomId, uids, mid, timestamp),
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            markUnread(uids.filter(uid => uid !== data.uid), data.roomId),
        ]);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const messages = await getMessagesData([mid], data.uid, data.roomId, true);
        if (!messages || !messages[0]) {
            return null;
        }

        messages[0].newSet = isNewSetTemp;
        messages[0].mid = mid;
        messages[0].roomId = data.roomId;
        try {
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            plugins.hooks.fire('action:messaging.save', { message: messages[0], data: data });
            return messages[0];
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async function addSystemMessage(content: string, uid: string, roomId: string) {
        const message:string = await addMessage({
            content: content,
            uid: uid,
            roomId: roomId,
            system: 1,
        });
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        notifyUsersInRoom(uid, roomId, message);
    }

    async function addRoomToUsers(roomId: string, uids:string[], timestamp:number) {
        if (!uids.length) {
            return [];
        }

        const keys = uids.map(uid => `uid:${uid}:chat:rooms`);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, roomId);
    }

    async function addMessageToUsers(roomId: string, uids:string[], mid:number, timestamp:number) {
        if (!uids.length) {
            return;
        }
        const keys = uids.map(uid => `uid:${uid}:chat:room:${roomId}:mids`);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, mid);
    }
};
