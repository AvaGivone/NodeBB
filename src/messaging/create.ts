const meta = require('../meta');
const plugins = require('../plugins');
const db = require('../database');
const user = require('../user');

type MessagingConfig ={
    sendMessage: (data: { content: string; uid: string; roomId: string }) => Promise<void>;
    checkContent: (content: string) => Promise<void>;
    isUserInRoom: (uid: string, roomId: string) => Promise<boolean>;
    addMessage: (data: { content: string, uid: string, roomId: string, system: number}) => Promise<void>;
    addRoomToUsers: (roomId: string, uids:string[], timestamp:number) => Promise<void>;
    addMessageToUsers: (roomId: string, uids:string[], mid:number, timestamp:number) => Promise<void>;
    isNewSet: (uid: string, roomId: string, timestamp: number) => Promise<boolean>;
    markUnread: (uids: string[], roomId: string) => Promise<void>;
    getMessagesData: (mids: number[], uid: string, roomId: string, isOwner: boolean) => Promise<boolean>;
    notifyUsersInRoom: (uid: string, roomId: string, message: any) => Promise<void>;
    addSystemMessage: (content: string, uid: string, roomId: string) => Promise<void>;
}


module.exports = function (Messaging: MessagingConfig) {
    Messaging.sendMessage = async (data: { content: string; uid: string; roomId: string, system: number }) => {
        await Messaging.checkContent(data.content);
        const inRoom = await Messaging.isUserInRoom(data.uid, data.roomId);
        if (!inRoom) {
            throw new Error('[[error:not-allowed]]');
        }

        return await Messaging.addMessage(data);
    };

    Messaging.checkContent = async (content: string) => {
        if (!content) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const maximumChatMessageLength = meta.config.maximumChatMessageLength || 1000;
        content = String(content).trim();
        let { length } = content;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        ({ content, length } = await plugins.hooks.fire('filter:messaging.checkContent', { content, length }));
        if (!content) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        if (length > maximumChatMessageLength) {
            throw new Error(`[[error:chat-message-too-long, ${maximumChatMessageLength}]]`);
        }
    };

    Messaging.addMessage = async (data:  { content: string, ip: number, timestamp: number, uid: string, roomId: string, system: number }) => {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const mid = await db.incrObjectField('global', 'nextMid');
        const timestamp = data.timestamp || Date.now();
        let message = {
            content: String(data.content),
            timestamp: timestamp,
            fromuid: data.uid,
            roomId: data.roomId,
            deleted: 0,
            system: data.system || 0,
            ip: undefined,
        };

        if (data.ip) {
            message.ip = data.ip;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        message = await plugins.hooks.fire('filter:messaging.save', message);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObject(`message:${mid}`, message);
        const isNewSet = await Messaging.isNewSet(data.uid, data.roomId, timestamp);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        let uids = await db.getSortedSetRange(`chat:room:${data.roomId}:uids`, 0, -1);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        uids = await user.blocks.filterUids(data.uid, uids);

        await Promise.all([
            Messaging.addRoomToUsers(data.roomId, uids, timestamp),
            Messaging.addMessageToUsers(data.roomId, uids, mid, timestamp),
            Messaging.markUnread(uids.filter(uid => uid !== String(data.uid)), data.roomId),
        ]);

        const messages = await Messaging.getMessagesData([mid], data.uid, data.roomId, true);
        if (!messages || !messages[0]) {
            return null;
        }

        messages[0].newSet = isNewSet;
        messages[0].mid = mid;
        messages[0].roomId = data.roomId;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        plugins.hooks.fire('action:messaging.save', { message: messages[0], data: data });
        return messages[0];
    };

    Messaging.addSystemMessage = async (content: string, uid: string, roomId: string) => {
        const message = await Messaging.addMessage({
            content: content,
            uid: uid,
            roomId: roomId,
            system: 1,
        });
        Messaging.notifyUsersInRoom(uid, roomId, message);
    };

    Messaging.addRoomToUsers = async (roomId: string, uids:string[], timestamp:number) => {
        if (!uids.length) {
            return;
        }

        const keys = uids.map(uid => `uid:${uid}:chat:rooms`);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, roomId);
    };

    Messaging.addMessageToUsers = async (roomId: string, uids:string[], mid:number, timestamp:number) => {
        if (!uids.length) {
            return;
        }
        const keys = uids.map(uid => `uid:${uid}:chat:room:${roomId}:mids`);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetsAdd(keys, timestamp, mid);
    };
};
