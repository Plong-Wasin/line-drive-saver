interface Config {
    LINE_CHANNEL_ACCESS_TOKEN?: string | null;
    SAVE_IMAGE: boolean;
    SAVE_VIDEO: boolean;
    SAVE_AUDIO: boolean;
    SAVE_FILE: boolean;
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

const LINE_CHANNEL_ACCESS_TOKEN = getConfigValue("LINE_CHANNEL_ACCESS_TOKEN");
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
function doPost(e) {
    jsonRequest = JSON.parse(e.postData.contents);
    if (getConfigValue("IS_LOG_REQUEST")) {
        log("Event", e.postData.contents);
    }
    run();
}
function test() {
    jsonRequest = JSON.parse(getConfigValue("TEST_PAYLOAD"));
    run();
}
function getEvent() {
    return jsonRequest.events[0];
}
function run() {
    const event = getEvent();
    const messageType = getMessageType();
    const selectedId = getSelectedId();
    const saveTypes = {
        image: getConfigValue("SAVE_IMAGE", selectedId),
        audio: getConfigValue("SAVE_AUDIO", selectedId),
        video: getConfigValue("SAVE_VIDEO", selectedId),
        file: getConfigValue("SAVE_FILE", selectedId),
    };
    const trueTypes = Object.entries(saveTypes)
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key);
    const messageText = event?.message?.text;
    if (trueTypes.includes(messageType)) {
        saveFile();
    } else if (messageType === "text" && messageText) {
        const userId = getUserId();
        writeMessageLog(event, messageText);
        if (
            getConfigValue("ALLOW_GET_LINK", userId) &&
            messageText === getConfigValue("COMMAND_GET_LINK", selectedId)
        ) {
            getLink();
        } else if (
            messageText === getConfigValue("COMMAND_GET_GROUP_ID", selectedId)
        ) {
            log("Get Group id", `${userId} Get Group id ${getGroupId()}`);
            sendMsg(event.replyToken, selectedId);
        } else if (
            messageText === getConfigValue("COMMAND_GET_USER_ID", selectedId)
        ) {
            log("Get User id", `${userId} Get User id ${getUserId()}`);
            sendMsg(event.replyToken, userId);
        } else if (
            messageText === getConfigValue("COMMAND_GET_CONFIG", selectedId)
        ) {
            log("Get help", `${getUserId()} Get help in ${selectedId}`);
            sendMsg(event.replyToken, configList(selectedId));
        } else if (
            messageText.startsWith(
                getConfigValue("COMMAND_PREFIX_SET_COMMANDS", selectedId)
            ) &&
            getConfigValue("ALLOW_OVERWRITE", selectedId)
        ) {
            const key = messageText
                .replace(
                    getConfigValue("COMMAND_PREFIX_SET_COMMANDS", selectedId),
                    ""
                )
                .split("=")[0]
                .trim();
            const value = messageText.split("=")[1].trim();
            if (
                key &&
                value &&
                key in defaultConfig() &&
                typeof defaultConfig()[key] === typeof convertValue(value)
            ) {
                setGroupConfig(key, selectedId, convertValue(value));
                sendMsg(event.replyToken, `Set ${key} to ${value}`);
                log(
                    `Set ${key} to ${value}`,
                    `${userId} Set ${key} to ${value} in ${selectedId}`
                );
            }
        }
    }
}

function getSelectedId() {
    return getGroupId() ?? getUserId();
}

function writeMessageLog(event, messageText) {}
function configList(selectedId) {
    const keys = Object.keys(defaultConfig()).filter(
        (key) => key !== "LINE_CHANNEL_ACCESS_TOKEN"
    );
    return keys
        .map((key) => `${key} = ${getConfigValue(key, selectedId)}`)
        .join("\n");
}

function getMessageType() {
    return getEvent().message.type;
}

function getGroupId() {
    return getEvent().source.groupId;
}

function getUserId() {
    return getEvent().source.userId;
}

function getSelectedFolder() {
    return createFolderIfNotExists(getSelectedId(), getCurrentFolder().getId());
}

function saveFile() {
    const event = getEvent();
    const groupId = getGroupId();
    const userId = getUserId();
    const groupFolder = getSelectedFolder();
    const messageType = getMessageType();
    const typeFolder = createFolderIfNotExists(
        messageType,
        groupFolder.getId()
    );
    const messageId = event.message.id;
    const fileName = event.message.fileName;
    const timestamp = event.timestamp;
    const file = fetchFile(messageId);
    const extension = file.getBlob().getContentType().split("/")[1];
    // replace file name pattern
    function replaceFileName(fileNamePattern) {
        const replaceValue = {
            "${userId}": userId,
            "${groupId}": groupId,
            "${messageId}": messageId,
            "${fileName}": fileName,
            "${timestamp}": timestamp,
            "${extension}": extension,
        };
        let newFileName = fileNamePattern;
        for (const [key, value] of Object.entries(replaceValue)) {
            newFileName = newFileName.replace(key, value);
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
        `${userId} save ${messageType} to ${
            groupId ?? userId
        }/${typeFolder}/${newFileName}`
    );
    // save file
    typeFolder.createFile(file.getBlob()).setName(newFileName);
}

function getLink() {
    const userId = getUserId();
    const groupId = getGroupId();
    const selectedId = groupId ?? userId;
    const replyToken = getEvent().replyToken;
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
function checkFolderExists(folderName: string, parentFolderId: string) {
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    const folders = parentFolder.getFoldersByName(folderName);

    return folders.hasNext();
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
function log(event, message) {
    createSheetIfNotExists("Log").appendRow([new Date(), event, message]);
}
function createFolderIfNotExists(folderName, parentFolderId) {
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
function createSpreadsheetFromFolder(
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
function createSheetIfNotExistsFromSpreadsheetId(spreadsheetId, sheetName) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // Check if the sheet already exists in the spreadsheet
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (sheet) {
        // Sheet already exists
        return;
    } else {
        // Create a new sheet
        sheet = spreadsheet.insertSheet(sheetName);

        // Add headers
        const headers = ["id", "first_name", "last_name"];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
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
        ALLOW_GET_LINK: true,
        ALLOW_OVERWRITE: true,
        COMMAND_GET_LINK: "!link",
        COMMAND_GET_GROUP_ID: "!group",
        COMMAND_GET_USER_ID: "!user",
        COMMAND_PREFIX_SET_COMMANDS: "!set",
        IMAGE_NAME_FORMAT: "${timestamp}.${extension}",
        VIDEO_NAME_FORMAT: "${timestamp}.${extension}",
        AUDIO_NAME_FORMAT: "${timestamp}.${extension}",
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
        value = value.trim();
        const lowerValue = value.toLowerCase();
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
