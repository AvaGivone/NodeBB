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
    isUserInRoom: (uid: number, roomId: number) => Promise<boolean>;
    addMessage: (data: { content: string, uid: number, roomId: number, system: number}) => Promise<void>;
    addRoomToUsers: (roomId: number, uids:number[], timestamp:number) => Promise<void>;
    addMessageToUsers: (roomId: number, uids:number[], mid:number, timestamp:number) => Promise<void>;
    markUnread: (uids: number[], roomId: number) => Promise<void>;
    getMessagesData: (mid: number[], uid: number, roomId: number, isOwner: boolean) => Promise<string>;
    addSystemMessage: (content: string, uid: number, roomId: number) => Promise<void>;
}

interface CustomData {
    content: string,
    uid: number,
    roomId: number,
    system: number,
    ip?: number,
    timestamp?: number,
    mid?: number,
    newSet?: boolean,
}

export = function (Messaging: MessagingConfig) {
    async function checkContent(content: string) {
        if (!content) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const maximumChatMessageLength:number = meta.config.maximumChatMessageLength as number || 1000 as number;
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

    async function addRoomToUsers(roomId: number, uids:number[], timestamp:number) {
        if (!uids.length) {
            return;
        }

        const keys = uids.map(uid => `uid:${uid}:chat:rooms`);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, roomId);
    }

    async function addMessageToUsers(roomId: number, uids:number[], mid:number, timestamp:number) {
        if (!uids.length) {
            return;
        }
        const keys = uids.map(uid => `uid:${uid}:chat:room:${roomId}:mids`);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, mid);
    }


    async function addMessage(data: CustomData) {
    // The next line calls a function in a module that has not been updated to TS yet
    //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const mid:number = await db.incrObjectField('global', 'nextMid') as number;
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
        let uids:number[] = await db.getSortedSetRange(`chat:room:${data.roomId}:uids`, 0, -1) as number[];
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        uids = await user.blocks.filterUids(data.uid, uids) as number[];

        await Promise.all([
            addRoomToUsers(data.roomId, uids, timestamp),
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            addMessageToUsers(data.roomId, uids, mid, timestamp),
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            markUnread(uids.filter(uid => uid !== data.uid), data.roomId),
        ]);
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const messages:CustomData[] = await getMessagesData([mid], data.uid, data.roomId, true) as CustomData[];
        if (!messages || !messages[0]) {
            return null;
        }

        messages[0].newSet = isNewSetTemp;
        messages[0].mid = mid;
        messages[0].roomId = data.roomId;
        try {
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            await plugins.hooks.fire('action:messaging.save', { message: messages[0], data: data });
            return messages[0];
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async function addSystemMessage(content: string, uid: number, roomId: number) {
        const message:CustomData = await addMessage({
            content: content,
            uid: uid,
            roomId: roomId,
            system: 1,
        });
        // The next line calls a function in a module that has not been updated to TS yet
        //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        notifyUsersInRoom(uid, roomId, message);
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
};
