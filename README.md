# LineDrive Saver

## About

This is a line bot that can save the file to the Google Drive.

## Requirements

1. [Line Developer Account](https://developers.line.biz/en/)
2. [Google Developer Account](https://drive.google.com/)

## Features

1. Save audio, image, video, file to the Google Drive
2. Share a Google Drive link.
3. Used in the group.
4. Can the configuration be separated by group.

## How to use

1. Create a folder in the Google Drive
2. Create a spreadsheet in the folder
3. Open the spreadsheet > Extensions > Apps Script
4. Copy and paste the code from [release](https://github.com/Plong-Wasin/line-drive-saver/releases/) in the Code.gs file
5. Run publishConfig function
6. Deploy > New Deployment > Web app
7. Who has access > Anyone
8. Deploy
9. Copy the URL and paste it into the webhook URL of the line bot
10. Config the line channel access token.
11. Add line bot as a friend
12. Invite the line bot to the group[Optional]
13. Done
