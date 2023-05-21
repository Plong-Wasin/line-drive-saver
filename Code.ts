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

const LINE_CHANNEL_ACCESS_TOKEN = getConfigValue("LINE_CHANNEL_ACCESS_TOKEN");
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
    const jsonRequest = JSON.parse(e.postData.contents);
    if (getConfigValue("IS_LOG_REQUEST")) {
        log("Event", e.postData.contents);
    }
    run(jsonRequest);
}
function test() {
    run(JSON.parse(getConfigValue("TEST_PAYLOAD")));
}
function run(jsonRequest) {
    const event = jsonRequest.events[0];
    const messageType = getMessageType(event);
    const selectedId = getGroupId(event) ?? getUserId(event);
    const saveTypes = {
        image: getConfigValue("SAVE_IMAGE", selectedId),
        audio: getConfigValue("SAVE_AUDIO", selectedId),
        video: getConfigValue("SAVE_VIDEO", selectedId),
        file: getConfigValue("SAVE_FILE", selectedId),
    };
    const trueTypes = Object.entries(saveTypes)
        .filter(([_, value]) => value === true)
        .map(([key, _]) => key);
    if (trueTypes.includes(messageType)) {
        saveFile(event);
    } else if (messageType === "text") {
        const messageText = event.message.text;
        const userId = getUserId(event);
        if (messageText === getConfigValue("COMMAND_GET_LINK", selectedId)) {
            getLink(event);
        } else if (
            messageText === getConfigValue("COMMAND_GET_GROUP_ID", selectedId)
        ) {
            log("Get Group id", `${userId} Get Group id ${getGroupId(event)}`);
            sendMsg(event.replyToken, selectedId);
        } else if (
            messageText === getConfigValue("COMMAND_GET_USER_ID", selectedId)
        ) {
            log("Get User id", `${userId} Get User id ${getUserId(event)}`);
            sendMsg(event.replyToken, userId);
        } else if (
            messageText === getConfigValue("COMMAND_GET_CONFIG", selectedId)
        ) {
            log("Get help", `${getUserId(event)} Get help in ${selectedId}`);
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
function configList(selectedId) {
    const keys = Object.keys(defaultConfig()).filter(
        (key) => key !== "LINE_CHANNEL_ACCESS_TOKEN"
    );
    return keys
        .map((key) => `${key} = ${getConfigValue(key, selectedId)}`)
        .join("\n");
}

function getMessageType(event: any) {
    return event.message.type;
}

function getGroupId(event: any) {
    return event.source.groupId;
}

function getUserId(event: any) {
    return event.source.userId;
}

function saveFile(event) {
    const groupId = getGroupId(event);
    const userId = getUserId(event);
    const groupFolder = createFolderIfNotExists(
        groupId ?? userId,
        getCurrentFolder().getId()
    );
    const messageType = getMessageType(event);
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

function getLink(event) {
    const userId = getUserId(event);
    const groupId = getGroupId(event);
    const selectedId = groupId ?? userId;
    const replyToken = event.replyToken;
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

function downloadFileFromURL(url, folderId, fileName) {
    const folder = DriveApp.getFolderById(folderId);
    const response = UrlFetchApp.fetch(url);
    const fileBlob = response.getBlob();
    folder.createFile(fileBlob).setName(fileName);
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

function getConfigValue(key: string, selectedId = null) {
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
