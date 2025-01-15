# LineDrive Saver

## About

LineDrive Saver is a Line bot that allows you to save files to Google Drive.

## Caution

**Important:** This script does not verify the signature of incoming requests from Line due to limitations with Google Apps Script, which does not support the verification of request signatures. As a result, it is **not recommended** to use this script in production environments or with sensitive data unless additional measures are taken to secure your webhook endpoints.

For enhanced security, consider implementing custom signature verification or using alternative methods to ensure that incoming requests are valid and coming from the trusted source.

## Requirements

1. **Line Developer Account**: Line Developer Account is required to create and manage your Line bot. You can sign up for a Line Developer Account at [Line Developers website](https://developers.line.biz/en/). Once you have an account, you'll be able to create a Line channel for your bot and obtain the Line channel access token.
2. **Google Account**: A Google Account is required to access Google Drive and save files. If you don't have a Google Account, you can create one at [Google Account Creation](https://accounts.google.com/signup). LineDrive Saver utilizes the Google Drive API to interact with Google Drive, and a Google Account provides the necessary authentication and access permissions to perform file operations.

## Features

- Save audio, images, videos, and files to Google Drive.
- Share Google Drive links.
- Use it in a group.
- Separate configurations for each group.

## How to Use

1. Create a folder in your Google Drive.
2. Create a spreadsheet within the folder.
3. Open the spreadsheet, go to Extensions, and select Apps Script.
4. Copy and paste the code from the [release](https://github.com/Plong-Wasin/line-drive-saver/releases/) into the Code.gs file.
5. Run the `publishConfig` function.
6. Deploy > New Deployment > Web app.
7. Choose "Anyone" for the "Who has access" option.
8. Deploy.
9. Copy the URL and paste it into the webhook URL of your Line bot.
10. Configure the Line channel access token.
11. Add the Line bot as a friend.
12. Optionally, invite the Line bot to the group.
13. Done!

## Configuration

You can configure the following settings in the code:

- `LINE_CHANNEL_ACCESS_TOKEN`: Line channel access token.
- `SAVE_IMAGE`: Allow saving images.
- `SAVE_VIDEO`: Allow saving videos.
- `SAVE_AUDIO`: Allow saving audio.
- `SAVE_FILE`: Allow saving files.
- `ALLOW_GET_LINK`: Allow getting the link.
- `ALLOW_OVERWRITE`: Allow overwriting configuration.
- `COMMAND_GET_LINK`: Command to get the link.
- `COMMAND_GET_GROUP_ID`: Command to get the group ID.
- `COMMAND_GET_USER_ID`: Command to get the user ID.
- `COMMAND_PREFIX_SET_COMMANDS`: Command prefix to set commands.
- `IMAGE_NAME_FORMAT`: Image name format.
- `VIDEO_NAME_FORMAT`: Video name format.
- `AUDIO_NAME_FORMAT`: Audio name format.
- `FILE_NAME_FORMAT`: File name format.
- `COMMAND_HELP`: Command to get help.
- `COMMAND_GET_CONFIG`: Command to get configuration.
- `IS_LOG_REQUEST`: Allow logging requests.
