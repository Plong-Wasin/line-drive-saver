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
    const replyToken = jsonRequest.events[0].replyToken;
    const event = jsonRequest.events[0];
    const messageType = event.message.type;
    const userId = event.source.userId;
    const groupId = event.source.groupId;
    const newGroupId = groupId ?? userId;
    if (["image", "file"].includes(messageType)) {
        const groupFolder = createFolderIfNotExists(
            newGroupId,
            getCurrentFolder().getId()
        );
        const typeFolder = createFolderIfNotExists(
            messageType,
            groupFolder.getId()
        );
        const messageId = event.message.id;
        const fileName = event.message.fileName;
        const newFileName = fileName
            ? `${messageId}_${fileName}`
            : `${messageId}.jpg`;
        log(
            "Save file",
            `${userId} save file to ${newGroupId}/${typeFolder}/${newFileName}`
        );
        // save file
        typeFolder
            .createFile(fetchFile(messageId).getBlob())
            .setName(newFileName);
    } else if (
        messageType == "text" &&
        event.message.text === getConfigValue("COMMAND_GET_LINK")
    ) {
        const isGroupFolderExists = getCurrentFolder()
            .getFoldersByName(newGroupId)
            .hasNext();
        if (isGroupFolderExists) {
            const groupFolder = getCurrentFolder()
                .getFoldersByName(newGroupId)
                .next();
            setFolderAccessToAnyone(groupFolder.getId());
            log("Get link", `${userId} Get link ${newGroupId}`);
            sendMsg(replyToken, groupFolder.getUrl());
        } else {
            log("Get link failed", `${userId} Get link failed ${newGroupId}`);
            sendMsg(replyToken, "No file found");
        }
    }
}
function checkFolderExists(folderName: string, parentFolderId: string) {
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    var folders = parentFolder.getFoldersByName(folderName);

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
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    var folders = parentFolder.getFoldersByName(folderName);

    if (folders.hasNext()) {
        // Folder already exists, return the existing folder
        return folders.next();
    } else {
        // Folder does not exist, create a new folder
        var newFolder = parentFolder.createFolder(folderName);
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
    var folder = DriveApp.getFolderById(folderId);
    var response = UrlFetchApp.fetch(url);
    var fileBlob = response.getBlob();
    folder.createFile(fileBlob).setName(fileName);
}

function getCurrentFolder() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var currentFile = DriveApp.getFileById(sheet.getId());
    var currentFolder = currentFile.getParents().next();

    return currentFolder;
}
function setFolderAccessToAnyone(folderId) {
    var folder = DriveApp.getFolderById(folderId);
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

function defaultConfig() {
    return {
        LINE_CHANNEL_ACCESS_TOKEN: null,
        SAVE_IMAGE: true,
        SAVE_VIDEO: true,
        SAVE_AUDIO: true,
        SAVE_FILE: true,
        ALLOW_GET_LINK: true,
        ALLOW_OVERWRITE: true,
        COMMAND_GET_LINK: "!link",
    };
}

function getConfigValue(key: string, groupId = null) {
    const defaultConfigValue = defaultConfig();
    const sheet = createSheetIfNotExists("Global Config");
    const keyColumn = 1;
    const valueColumn = 2;
    const lastRow = sheet.getLastRow();
    const groupSheet = createSheetIfNotExists("Group Config");
    for (let i = 1; i <= lastRow; i++) {
        if (
            sheet.getRange(i, keyColumn).getValue() == key &&
            groupSheet.getRange(i, 2).getValue() == groupId
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
function convertValue(value) {
    if (typeof value === "string") {
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
    if (!isNaN(value)) {
        return Number(value);
    }
    return value;
}
