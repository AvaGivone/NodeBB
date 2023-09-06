"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const meta_1 = __importDefault(require("../meta"));
const plugins_1 = __importDefault(require("../plugins"));
const database_1 = __importDefault(require("../database"));
const user_1 = __importDefault(require("../user"));
const notifications_1 = require("../notifications");
const rooms_1 = require("./rooms");
const unread_1 = require("./unread");
const data_1 = require("./data");
const index_1 = require("./index");
module.exports = function (Messaging) {
    function checkContent(content) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!content) {
                throw new Error('[[error:invalid-chat-message]]');
            }
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const maximumChatMessageLength = meta_1.default.config.maximumChatMessageLength || 1000;
            content = String(content).trim();
            let { length } = content;
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            ({ content, length } = yield plugins_1.default.hooks.fire('filter:messaging.checkContent', { content, length }));
            if (!content) {
                throw new Error('[[error:invalid-chat-message]]');
            }
            if (length > maximumChatMessageLength) {
                throw new Error(`[[error:chat-message-too-long, ${maximumChatMessageLength}]]`);
            }
        });
    }
    function addMessageToUsers(roomId, uids, mid, timestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!uids.length) {
                return;
            }
            const keys = uids.map(uid => `uid:${uid}:chat:room:${roomId}:mids`);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.sortedSetsAdd(keys, timestamp, mid);
        });
    }
    function addRoomToUsers(roomId, uids, timestamp) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!uids.length) {
                return;
            }
            const keys = uids.map(uid => `uid:${uid}:chat:rooms`);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.sortedSetsAdd(keys, timestamp, roomId);
        });
    }
    function addMessage(data) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const mid = yield database_1.default.incrObjectField('global', 'nextMid');
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
            message = yield plugins_1.default.hooks.fire('filter:messaging.save', message);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions
            yield database_1.default.setObject(`message:${mid}`, message);
            const isNewSetTemp = yield (0, index_1.isNewSet)(data.uid, data.roomId, timestamp);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            let uids = yield database_1.default.getSortedSetRange(`chat:room:${data.roomId}:uids`, 0, -1);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            uids = (yield user_1.default.blocks.filterUids(data.uid, uids));
            yield Promise.all([
                addRoomToUsers(data.roomId, uids, timestamp),
                // The next line calls a function in a module that has not been updated to TS yet
                //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                addMessageToUsers(data.roomId, uids, mid, timestamp),
                // The next line calls a function in a module that has not been updated to TS yet
                //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
                (0, unread_1.markUnread)(uids.filter(uid => uid !== data.uid), data.roomId),
            ]);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const messages = yield (0, data_1.getMessagesData)([mid], data.uid, data.roomId, true);
            if (!messages || !messages[0]) {
                return null;
            }
            messages[0].newSet = isNewSetTemp;
            messages[0].mid = mid;
            messages[0].roomId = data.roomId;
            try {
                // The next line calls a function in a module that has not been updated to TS yet
                //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                yield plugins_1.default.hooks.fire('action:messaging.save', { message: messages[0], data: data });
                return messages[0];
            }
            catch (error) {
                console.error(error);
                throw error;
            }
        });
    }
    function addSystemMessage(content, uid, roomId) {
        return __awaiter(this, void 0, void 0, function* () {
            const message = yield addMessage({
                content: content,
                uid: uid,
                roomId: roomId,
                system: 1,
            });
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            (0, notifications_1.notifyUsersInRoom)(uid, roomId, message);
        });
    }
    function sendMessage(data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield checkContent(data.content);
            // The next line calls a function in a module that has not been updated to TS yet
            //  eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const inRoom = yield (0, rooms_1.isUserInRoom)(data.uid, data.roomId);
            if (!inRoom) {
                throw new Error('[[error:not-allowed]]');
            }
            return yield addMessage(data);
        });
    }
};
