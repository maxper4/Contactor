## Contactor

Contactor is a server listening for incoming communications from others bots (using node-ipc) to send them to the owner via discord private messages (DM).
This way, you don't need to be online to receive alerts from your bots, or to have an SMTP server to receive alerts from your bots.

### Installation

1. Clone the repository
2. Install the dependencies with `npm install`
3. Create a discord bot and get its token (https://discordjs.guide/preparations/setting-up-a-bot-application.html#your-bot-s-token)
4. Create a file named `config.json` in the root directory of the project.
Example:
```json
{
    "DISCORD_BOT_TOKEN": "your discord bot token",
    "CONTACTS": [
        { 
            "nickname": "owner (a nickname you want to use to contact the owner)",
            "discordId": "your discord id (not the nickname, found with the developer mode)"
        }
    ],
    "TO_CONTACT_ON_ALERT": [
        "owner"
    ]
}
```

5. Run the server with `npm start`

### Commands available
Commands are sent to the bot via discord private messages (DM) and need that you are registered as a contact.

- ping : check if the bot is alive (should reply pong)
- nickname : get the nickname of the contact
- reload : reload the config file