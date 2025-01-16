interface Config {
    LINE_CHANNEL_ACCESS_TOKEN?: string | null;
    SAVE_IMAGE: boolean;
    SAVE_VIDEO: boolean;
    SAVE_AUDIO: boolean;
    SAVE_FILE: boolean;
    SAVE_MESSAGE: boolean;
    SAVE_LINK: boolean;
    ALLOW_GET_LINK: boolean;
    ALLOW_OVERWRITE: boolean;
    COMMAND_GET_LINK: string;
    COMMAND_GET_GROUP_ID: string;
    COMMAND_GET_USER_ID: string;
    COMMAND_PREFIX_SET_COMMANDS: string;
    COMMAND_GET_CONFIG: string;
    IMAGE_NAME_FORMAT: string;
    VIDEO_NAME_FORMAT: string;
    AUDIO_NAME_FORMAT: string;
    FILE_NAME_FORMAT: string;
    IS_LOG_REQUEST?: boolean;
    TEST_PAYLOAD?: string;
}
export interface JsonRequest {
    destination: string;
    events: ChatEvent[];
}

export interface ChatEvent {
    type: string;
    message: Message;
    webhookEventId: string;
    deliveryContext: DeliveryContext;
    timestamp: number;
    source: Source;
    replyToken: string;
    mode: string;
}

export interface DeliveryContext {
    isRedelivery: boolean;
}

export interface Message {
    type: string;
    id: string;
    text?: string;
    fileName?: string;
    fileSize?: number;
    contentProvider?: ContentProvider;
    duration?: number;
}

export interface ContentProvider {
    type: string;
}

export interface Source {
    type: string;
    groupId: string;
    userId: string;
}

export interface LineUser {
    userId: string;
    displayName: string;
    pictureUrl: string;
    language?: string;
}

const LINE_CHANNEL_ACCESS_TOKEN = getConfigValue("LINE_CHANNEL_ACCESS_TOKEN");
const scriptCache = CacheService.getScriptCache();
let jsonRequest: JsonRequest;

function publishConfig() {
    const sheet = createSheetIfNotExists("Global Config");
    createSheetIfNotExists("Group Config");
    const keyColumn = 1;
    const defaultConfigValue = defaultConfig();
    const lastRow = sheet.getLastRow();
    for (const key in defaultConfigValue) {
        let isKeyExists = false;
        for (let i = 1; i <= lastRow; i++) {
            if (sheet.getRange(i, keyColumn).getValue() == key) {
                isKeyExists = true;
                break;
            }
        }
        if (!isKeyExists) {
            sheet.appendRow([key, defaultConfigValue[key]]);
        }
    }
}

/**
 * Handles incoming HTTP POST requests.
 * @param e - Event object containing the POST request data.
 */
function doPost(e: GoogleAppsScript.Events.DoPost): void {
    jsonRequest = JSON.parse(e.postData.contents);

    const isLoggingEnabled = getConfigValue("IS_LOG_REQUEST") as boolean;
    if (isLoggingEnabled) {
        log("Webhook Event Received", e.postData.contents);
    }

    for (const event of jsonRequest.events) {
        try {
            if (scriptCache.get(event.webhookEventId)) {
                continue; // Skip duplicate events.
            }

            scriptCache.put(event.webhookEventId, "true", 3600);
            processEvent(event);
        } catch (err) {
            const error = err as Error;
            log("Error processing event", error);
            log("Error processing event data", e.postData.contents);
        }
    }
}

function test() {
    jsonRequest = JSON.parse(getConfigValue("TEST_PAYLOAD"));
    for (const event of jsonRequest.events) {
        processEvent(event);
    }
}

/**
 * Processes each incoming chat event and performs actions based on the event's message.
 * @param chatEvent - The chat event to process.
 */
function processEvent(chatEvent: ChatEvent) {
    const selectedId = chatEvent.source.groupId ?? chatEvent.source.userId;

    if (chatEvent.type === "message") {
        handleMessage(chatEvent, selectedId);
    }
}

function handleMessage(chatEvent: ChatEvent, selectedId: string) {
    const messageType = chatEvent.message.type;
    const messageText = chatEvent.message.text;
    const saveTypes = {
        image: getConfigValue("SAVE_IMAGE", selectedId),
        audio: getConfigValue("SAVE_AUDIO", selectedId),
        video: getConfigValue("SAVE_VIDEO", selectedId),
        file: getConfigValue("SAVE_FILE", selectedId),
    };
    const allowedMessageTypes = Object.entries(saveTypes)
        .filter(([_, shouldSave]) => shouldSave)
        .map(([type]) => type);
    if (allowedMessageTypes.includes(messageType)) {
        saveFile(chatEvent);
    } else if (messageType === "text" && messageText) {
        handleCommandMessages(chatEvent, messageText, selectedId);
        logMessage(chatEvent);
    }
}

/**
 * Handles specific command messages sent by the user.
 * @param chatEvent - The event containing the message.
 * @param messageText - The text of the message.
 * @param selectedId - The selected ID (group or user).
 */
function handleCommandMessages(
    chatEvent: ChatEvent,
    messageText: string,
    selectedId: string
) {
    const userId = chatEvent.source.userId;

    if (
        getConfigValue("ALLOW_GET_LINK", userId) &&
        messageText === getConfigValue("COMMAND_GET_LINK", selectedId)
    ) {
        getLink(chatEvent);
    } else if (
        messageText === getConfigValue("COMMAND_GET_GROUP_ID", selectedId)
    ) {
        log(
            "Get Group id",
            `${userId} Get Group id ${chatEvent.source.groupId}`
        );
        sendMsg(chatEvent.replyToken, selectedId);
    } else if (
        messageText === getConfigValue("COMMAND_GET_USER_ID", selectedId)
    ) {
        log("Get User id", `${userId} Get User id ${chatEvent.source.userId}`);
        sendMsg(chatEvent.replyToken, userId);
    } else if (
        messageText === getConfigValue("COMMAND_GET_CONFIG", selectedId)
    ) {
        log("Get help", `${userId} Get help in ${selectedId}`);
        sendMsg(chatEvent.replyToken, configList(selectedId));
    } else if (
        messageText.startsWith(
            getConfigValue("COMMAND_PREFIX_SET_COMMANDS", selectedId)
        ) &&
        getConfigValue("ALLOW_OVERWRITE", selectedId)
    ) {
        setConfigFromMessage(chatEvent, messageText, selectedId);
    }
}
/**
 * Sets the group configuration from a message command.
 * @param chatEvent - The event containing the message.
 * @param messageText - The text of the message.
 * @param selectedId - The selected ID (group or user).
 */
function setConfigFromMessage(
    chatEvent: ChatEvent,
    messageText: string,
    selectedId: string
) {
    const keyValue = messageText
        .replace(getConfigValue("COMMAND_PREFIX_SET_COMMANDS", selectedId), "")
        .split("=");

    const key = keyValue[0]?.trim();
    const value = keyValue[1]?.trim();

    if (
        key &&
        value &&
        key in defaultConfig() &&
        typeof defaultConfig()[key] === typeof convertValue(value)
    ) {
        setGroupConfig(key, selectedId, convertValue(value));
        sendMsg(chatEvent.replyToken, `Set ${key} to ${value}`);
        log(
            `Set ${key} to ${value}`,
            `${chatEvent.source.userId} Set ${key} to ${value} in ${selectedId}`
        );
    }
}

/**
 * Logs the message details to the appropriate log sheet.
 * @param chatEvent - The event containing the message.
 */
function logMessage(chatEvent: ChatEvent) {
    const selectedId = chatEvent.source.groupId ?? chatEvent.source.userId;
    const logSpreadsheet = createSpreadsheetFromFolderId(
        getSelectedFolder(selectedId).getId(),
        "log"
    );
    const logSheet = createSheetIfNotExistsFromSpreadsheetId(
        logSpreadsheet.getId(),
        "log"
    );
    const userSheet = createSheetIfNotExistsFromSpreadsheetId(
        logSpreadsheet.getId(),
        "users"
    );
    const linkSheet = createSheetIfNotExistsFromSpreadsheetId(
        logSpreadsheet.getId(),
        "links"
    );

    ensureUserSheetIsPopulated(
        userSheet,
        chatEvent.source.userId,
        chatEvent.source.groupId
    );

    const userId = chatEvent.source.userId;
    const userDisplayName = getDisplayName(userSheet, userId);
    if (getConfigValue("SAVE_MESSAGE", selectedId)) {
        appendLogData(logSheet, userDisplayName, chatEvent);
    }
    if (getConfigValue("SAVE_LINK", selectedId)) {
        appendLinks(linkSheet, userDisplayName, chatEvent);
    }
}

/**
 * Ensures that the user sheet is populated with the necessary data.
 * @param userSheet - The user sheet to check.
 * @param userId - The user ID to check.
 * @param groupId - The group ID to check.
 */
function ensureUserSheetIsPopulated(
    userSheet,
    userId: string,
    groupId?: string
) {
    if (!userSheet.getRange(1, 1).getValue()) {
        userSheet.appendRow([
            "userId",
            "displayName",
            "pictureUrl",
            "language",
        ]);
    }

    const displayName = getDisplayName(userSheet, userId);
    if (!displayName) {
        const lineUser = groupId
            ? getUserProfileFromGroup(groupId, userId)
            : getLineUser(userId);
        userSheet.appendRow([
            lineUser.userId,
            lineUser.displayName,
            lineUser.pictureUrl,
            lineUser.language,
        ]);
    }
}

/**
 * Retrieves the display name of a user.
 * @param userSheet - The user sheet to check.
 * @param userId - The user ID to look up.
 * @returns The display name of the user.
 */
function getDisplayName(
    userSheet: GoogleAppsScript.Spreadsheet.Sheet,
    userId: string
): string {
    let displayName = "";
    for (let i = 1; i <= userSheet.getLastRow(); i++) {
        if (userSheet.getRange(i, 1).getValue() === userId) {
            displayName = userSheet.getRange(i, 2).getValue();
            break;
        }
    }
    return displayName;
}

/**
 * Appends log data to the log sheet.
 * @param logSheet - The log sheet to append data to.
 * @param displayName - The display name of the user.
 * @param message - The message data to log.
 */
function appendLogData(
    logSheet: GoogleAppsScript.Spreadsheet.Sheet,
    displayName: string,
    chatEvent: ChatEvent
) {
    logSheet.appendRow([
        new Date(chatEvent.timestamp * 1000),
        displayName,
        chatEvent.message.type,
        chatEvent.message.id,
        chatEvent.message.text,
    ]);
}

/**
 * Appends extracted links from the message text to the link sheet.
 * @param linkSheet - The link sheet to append data to.
 * @param message - The message containing the text with links.
 */
function appendLinks(
    linkSheet: GoogleAppsScript.Spreadsheet.Sheet,
    userDisplayName: string,
    chatEvent: ChatEvent
) {
    const extractedLinks = extractLinksFromString(chatEvent.message.text ?? "");
    extractedLinks.forEach((link) => {
        linkSheet.appendRow([
            new Date(chatEvent.timestamp * 1000),
            userDisplayName,
            chatEvent.message.id,
            link,
        ]);
    });
}

function configList(selectedId) {
    const hiddenKeys = ["LINE_CHANNEL_ACCESS_TOKEN"];
    const keys = Object.keys(defaultConfig()).filter(
        (key) => !hiddenKeys.includes(key)
    );
    return keys
        .map((key) => `${key} = ${getConfigValue(key, selectedId)}`)
        .join("\n");
}

function getSelectedFolder(selectedId: string) {
    return createFolderIfNotExists(selectedId, getCurrentFolder().getId());
}

/**
 * Saves a file uploaded via a chat event to the appropriate folder in Google Drive.
 * The file is renamed based on predefined naming patterns and additional metadata.
 *
 * @param {ChatEvent} chatEvent - The chat event object containing details about the file upload.
 */
function saveFile(chatEvent: ChatEvent) {
    // Extract relevant data from the chat event
    const groupId = chatEvent.source.groupId;
    const userId = chatEvent.source.userId;
    const groupFolder = getSelectedFolder(groupId ?? userId);
    const messageType = chatEvent.message.type;
    const typeFolder = createFolderIfNotExists(
        messageType,
        groupFolder.getId()
    );
    const messageId = chatEvent.message.id;
    const fileName = chatEvent.message.fileName;
    const timestamp = chatEvent.timestamp;
    const webhookEventId = chatEvent.webhookEventId;

    // Convert the timestamp to a Date object
    const eventDate = new Date(timestamp * 1000);

    const file = fetchFile(messageId);
    const extension = file.getBlob().getContentType().split("/")[1];

    /**
     * Formats a Date object into a string with the format YYYYMMDDHHMMSS.
     * @param {Date} date - The date to format.
     * @returns {string} The formatted date string.
     */
    function formatDateTime(date: Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    /**
     * Replaces placeholders in a file name pattern with corresponding values.
     * @param {string} fileNamePattern - The pattern to replace placeholders in.
     * @returns {string} The updated file name with placeholders replaced.
     */
    function replaceFileName(fileNamePattern: string) {
        const replaceValue = {
            "${userId}": userId,
            "${groupId}": groupId,
            "${messageId}": messageId,
            "${fileName}": fileName ?? "",
            "${timestamp}": timestamp,
            "${extension}": extension,
            "${webhookEventId}": webhookEventId,
            "${eventDate}": formatDateTime(eventDate),
        };
        let newFileName = fileNamePattern;
        for (const [key, value] of Object.entries(replaceValue)) {
            newFileName = newFileName.replace(key, value.toString());
        }
        return newFileName;
    }

    // get new file names based on message type and config values
    const fileNameFormats = {
        file: replaceFileName(getConfigValue("FILE_NAME_FORMAT", groupId)),
        image: replaceFileName(getConfigValue("IMAGE_NAME_FORMAT", groupId)),
        video: replaceFileName(getConfigValue("VIDEO_NAME_FORMAT", groupId)),
        audio: replaceFileName(getConfigValue("AUDIO_NAME_FORMAT", groupId)),
    };

    const newFileNames = Object.fromEntries(
        Object.entries(fileNameFormats).map(([type, format]) => [
            type,
            replaceFileName(format) ?? fileName,
        ])
    );
    // save file with new file name
    const newFileName = newFileNames[messageType] ?? fileName;
    log(
        `Save ${messageType}`,
        `${userId} saved ${messageType} to ${
            groupId ?? userId
        }/${typeFolder}/${newFileName}`
    );
    // save file
    typeFolder.createFile(file.getBlob()).setName(newFileName);
}

function getLink(chatEvent: ChatEvent) {
    const userId = chatEvent.source.userId;
    const groupId = chatEvent.source.groupId;
    const selectedId = groupId ?? userId;
    const replyToken = chatEvent.replyToken;
    const isGroupFolderExists = getCurrentFolder()
        .getFoldersByName(selectedId)
        .hasNext();
    if (isGroupFolderExists) {
        const groupFolder = getCurrentFolder()
            .getFoldersByName(groupId ?? userId)
            .next();
        setFolderAccessToAnyone(groupFolder.getId());
        log("Get link", `${userId} Get link ${selectedId}`);
        sendMsg(replyToken, groupFolder.getUrl());
    } else {
        log("Get link failed", `${userId} Get link failed ${selectedId}`);
        sendMsg(replyToken, "No file found");
    }
}

function fetchFile(messageId) {
    const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const opt = {
        headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
    };
    const response = UrlFetchApp.fetch(url, opt);
    return response;
}
function log(event: string, message) {
    createSheetIfNotExists("Log").appendRow([new Date(), event, message]);
}
function createFolderIfNotExists(folderName: string, parentFolderId: string) {
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    const folders = parentFolder.getFoldersByName(folderName);

    if (folders.hasNext()) {
        // Folder already exists, return the existing folder
        return folders.next();
    } else {
        // Folder does not exist, create a new folder
        const newFolder = parentFolder.createFolder(folderName);
        return newFolder;
    }
}
function createSpreadsheetFromFolderId(
    folderId: string,
    spreadsheetName: string
) {
    const folder = DriveApp.getFolderById(folderId);

    // Check if a spreadsheet with the desired name already exists in the folder
    const existingSpreadsheet = folder.getFilesByName(spreadsheetName);

    if (existingSpreadsheet.hasNext()) {
        // Spreadsheet already exists
        const spreadsheet = SpreadsheetApp.open(existingSpreadsheet.next());
        return spreadsheet;
    } else {
        // Create a new spreadsheet
        const spreadsheet = SpreadsheetApp.create(spreadsheetName);

        // Move the newly created spreadsheet to the desired folder
        DriveApp.getFileById(spreadsheet.getId()).moveTo(folder);

        return spreadsheet;
    }
}
function createSheetIfNotExistsFromSpreadsheetId(
    spreadsheetId: string,
    sheetName: string
) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // Check if the sheet already exists in the spreadsheet
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (sheet) {
        // Sheet already exists
        return sheet;
    } else {
        // Create a new sheet
        sheet = spreadsheet.insertSheet(sheetName);
        return sheet;
    }
}
function sendMsg(replyToken: string, msg: string) {
    const url = "https://api.line.me/v2/bot/message/reply";

    const opt: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        method: "post",
        payload: JSON.stringify({
            replyToken: replyToken,
            messages: [{ type: "text", text: msg }],
        }),
    };
    UrlFetchApp.fetch(url, opt);
}

function getCurrentFolder() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    const currentFile = DriveApp.getFileById(sheet.getId());
    const currentFolder = currentFile.getParents().next();

    return currentFolder;
}
function setFolderAccessToAnyone(folderId) {
    const folder = DriveApp.getFolderById(folderId);
    folder.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
    );
    return folder;
}
function createSheetIfNotExists(sheetName) {
    const spreadsheet = SpreadsheetApp.getActive();
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        sheet = spreadsheet.insertSheet();
        sheet.setName(sheetName);
    }
    return sheet;
}

function defaultConfig(): Config {
    return {
        LINE_CHANNEL_ACCESS_TOKEN: null,
        SAVE_IMAGE: true,
        SAVE_VIDEO: true,
        SAVE_AUDIO: true,
        SAVE_FILE: true,
        SAVE_MESSAGE: true,
        SAVE_LINK: true,
        ALLOW_GET_LINK: true,
        ALLOW_OVERWRITE: true,
        COMMAND_GET_LINK: "!link",
        COMMAND_GET_GROUP_ID: "!group",
        COMMAND_GET_USER_ID: "!user",
        COMMAND_PREFIX_SET_COMMANDS: "!set",
        IMAGE_NAME_FORMAT: "${timestamp}_${messageId}.${extension}",
        VIDEO_NAME_FORMAT: "${timestamp}_${messageId}.${extension}",
        AUDIO_NAME_FORMAT: "${timestamp}_${messageId}.${extension}",
        FILE_NAME_FORMAT: "${timestamp}_${fileName}",
        COMMAND_GET_CONFIG: "!config",
    };
}

function getConfigValue(key: string, selectedId: string | null = null) {
    const defaultConfigValue = defaultConfig();
    const sheet = createSheetIfNotExists("Global Config");
    const keyColumn = 1;
    const valueColumn = 2;
    const lastRow = sheet.getLastRow();
    const groupSheet = createSheetIfNotExists("Group Config");
    for (let i = 1; i <= lastRow; i++) {
        if (
            groupSheet.getRange(i, keyColumn).getValue() == key &&
            groupSheet.getRange(i, 2).getValue() == selectedId
        ) {
            return convertValue(groupSheet.getRange(i, 3).getValue());
        }
    }
    const scriptProperty =
        PropertiesService.getScriptProperties().getProperty(key);
    if (scriptProperty) {
        return convertValue(scriptProperty);
    }
    for (let i = 1; i <= lastRow; i++) {
        if (sheet.getRange(i, keyColumn).getValue() == key) {
            return convertValue(sheet.getRange(i, valueColumn).getValue());
        }
    }
    return defaultConfigValue[key];
}
function setGroupConfig(key, selectedId, value) {
    const groupSheet = createSheetIfNotExists("Group Config");
    for (let i = 1; i <= groupSheet.getLastRow(); i++) {
        if (
            groupSheet.getRange(i, 2).getValue() == selectedId &&
            groupSheet.getRange(i, 1).getValue() == key
        ) {
            groupSheet.getRange(i, 3).setValue(value);
            return;
        }
    }
    groupSheet.appendRow([key, selectedId, value]);
}
function convertValue(value) {
    if (typeof value === "string") {
        const lowerValue = value.trim().toLowerCase();
        const converter = {
            true: true,
            false: false,
            yes: true,
            no: false,
            null: null,
        };
        if (lowerValue in converter) {
            return converter[lowerValue];
        }
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (!isNaN(value)) {
        return Number(value);
    }
    return value.trim();
}

function getLineUser(userId: string) {
    const cacheKey = `lineUser_${userId}`;
    if (scriptCache.get(cacheKey)) {
        return JSON.parse(scriptCache.get(cacheKey) ?? "{}");
    }
    const url = `https://api.line.me/v2/bot/profile/${userId}`;
    const opt = {
        headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
    };
    const response = UrlFetchApp.fetch(url, opt);
    scriptCache.put(cacheKey, response.getContentText());
    return JSON.parse(response.getContentText());
}

/**
 * Fetches the LINE user profile from a specific group using the group ID and user ID.
 *
 * @param groupId - The ID of the LINE group.
 * @param userId - The ID of the LINE user to fetch.
 * @returns An object representing the LINE user's profile.
 */
function getUserProfileFromGroup(groupId: string, userId: string): LineUser {
    const cacheKey = `lineUser_${groupId}_${userId}`;
    if (scriptCache.get(cacheKey)) {
        return JSON.parse(scriptCache.get(cacheKey) ?? "{}");
    }
    const url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
    const opt = {
        headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
    };
    const response = UrlFetchApp.fetch(url, opt);
    scriptCache.put(cacheKey, response.getContentText());
    return JSON.parse(response.getContentText());
}
function extractLinksFromString(text: string) {
    const regex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(regex);
    if (matches) {
        return matches;
    }
    return [];
}
