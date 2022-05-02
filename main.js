import { Client } from 'discord.js';
const client = new Client();
import { CronJob } from 'cron';
import got from 'got';
import editJsonFile from "edit-json-file";

const DISCORD_MESSAGE_LIMIT = 2000;
const prefix = "!";

const configPath = './data/config.json'
const config = await import(configPath);

const textCommandsPath = './data/textCommands.json'
let textCommands = await import(textCommandsPath);
textCommands = textCommands.default;

const sendChannelMessage = (message, content) => {
    if(content.length > DISCORD_MESSAGE_LIMIT) {
        let contentPart = content.substring(0, DISCORD_MESSAGE_LIMIT);
        message.channel.send(`${contentPart}`);

        sendChannelMessage(message, content.substring(DISCORD_MESSAGE_LIMIT, content.length));
    } else {
        message.channel.send(`${content}`);
        return 0;
    }
}

const saveTextCommandFile = (newTextCommands) => {
    const cmdFile = editJsonFile(`${textCommandsPath}`);
    cmdFile.set("textCommands", newTextCommands.textCommands);
    cmdFile.save();
}

const cmdList = (message, currentTextCommands) => {
    let cmdList = "";
    let cmdListTemp = "";
    for(let i=0; i<currentTextCommands.textCommands.length; i++) {
        cmdListTemp = cmdList + '```' + currentTextCommands.textCommands[i][0] + ' : ' + currentTextCommands.textCommands[i][1] + '```\n';
        // Si le message potentiel est supérieur à la limite de caractères autorisée, on l'envoie tel qu'il l'était à son état précédent, sinon, on continue d'ajouter de nouveaux éléments à ce potentiel message
        if(cmdListTemp.length > DISCORD_MESSAGE_LIMIT) {
            sendChannelMessage(message, cmdList);
            cmdList = '```' + currentTextCommands.textCommands[i][0] + ' : ' + currentTextCommands.textCommands[i][1] + '```\n';
        } else {
            cmdList = cmdListTemp;
        }
    }
    // Enfin, si avec le dernier message en préparation nous n'avons pas atteint la limite de caractères mais qu'il n'y a plus d'éléments à ajouter, nous l'envoyons en l'état
    sendChannelMessage(message, cmdList);
}

const cmdMgmt = async (message, cmd, action, currentTextCommands) => {
    try {
        let cmdName = cmd.shift().toLowerCase(); // Un shift a déjà été effectué précédemment, nous récupérons donc le premier argument de la commande initiale
        let cmdValue = cmd.join(' ');

        switch(action) {
            case 'add':
                for(let i=0; i<currentTextCommands.textCommands.length; i++) {
                    if(cmdName === currentTextCommands.textCommands[i][0]) {
                        message.channel.send(`La commande "${cmdName}" existe déjà.`);
                        return 0;
                    }
                }
                let newCmd = [cmdName, cmdValue];
                currentTextCommands.textCommands.push(newCmd);
                saveTextCommandFile(currentTextCommands);

                console.log(`La commande "${cmdName}" avec pour valeur "${cmdValue}" a été ajoutée.`)
                message.channel.send(`La commande "${cmdName}" avec pour valeur "${cmdValue}" a été ajoutée.`);
                break;
            case 'edit':
                for(let i=0; i<currentTextCommands.textCommands.length; i++) {
                    if(cmdName === currentTextCommands.textCommands[i][0]) {
                        currentTextCommands.textCommands[i][1] = cmdValue;
                        saveTextCommandFile(currentTextCommands);

                        console.log(`La commande "${cmdName}" a pour nouvelle valeur "${cmdValue}".`)
                        message.channel.send(`La commande "${cmdName}" a pour nouvelle valeur "${cmdValue}".`);
                        return 0;
                    }
                }
                message.channel.send(`La commande "${cmdName}" n'a pas été trouvée, veuillez réessayer.`);
                break;
            case 'rm':
                for(let i=0; i<currentTextCommands.textCommands.length; i++) {
                    if(cmdName === currentTextCommands.textCommands[i][0]) {
                        currentTextCommands.textCommands.splice(i,i);
                        saveTextCommandFile(currentTextCommands);
                        message.channel.send(`La commande "${cmdName}" a bien été supprimée.`);
                    }
                }
                break;
        }

        textCommands = await import(textCommandsPath); // Pour prendre en compte la nouvelle version du fichiers des commandes
        textCommands = textCommands.default;
    } catch (err) {
        message.channel.send(`Error : ${err}`);
        console.error(err)
    }
}

// EVENTS

client.on("ready", async function () {
    console.log("Alsy Command Bot launched !");
})

client.on("message", async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.content.startsWith(prefix)) return;

        const commandBody = message.content.slice(prefix.length);
        const args = commandBody.split(' ');
        const command = args.shift().toLowerCase();

        let brutStats = ""

        // Textuel
        for(let i=0; i<textCommands.textCommands.length; i++) {
            if(command === textCommands.textCommands[i][0]) {
                let value = textCommands.textCommands[i][1].replace('<EOL>', '\n');
                sendChannelMessage(message, value)
                return 0;
            }
        }

        // Role admin requis
        if (message.member.roles.cache.some(r => r.name === "Modérateurs") || message.member.roles.cache.some(r => r.name === "Le role des modos du bot")) {
            switch (command) {
                // Utile
                case 'init':
                    if(!config.default.init) {
                        const filter = (reaction) => reaction.emoji.name === '✅';
                        const collector = await message.guild.channels.cache.find(ch => ch.id === config.default.discordRulesChanId).messages.fetch(config.default.discordRulesMessageId).then(message => message.createReactionCollector(filter)).catch(console.error);

                        const memberRole = message.guild.roles.cache.find(r => r.name === "Membre");

                        collector.on('collect', r =>
                            message.guild.members.cache.get(r.users.cache.last().id).roles.add(memberRole)
                        );
                    }
                    break;

                case 'add':
                    cmdMgmt(message, args, 'add', textCommands);
                    break;

                case 'edit':
                    cmdMgmt(message, args, 'edit', textCommands);
                    break;

                case 'rm':
                case 'remove':
                case 'delete':
                    cmdMgmt(message, args, 'rm', textCommands);
                    break;

                case 'cmdlist':
                    cmdList(message, textCommands);
                    break;

                default:
                    message.channel.send("Commande inconnue.");
                    console.log(`${command} : commande inconnue.`);
                }
        } else {
            console.log("Role non accepté");
        }

        // Role admin non requis
        switch (command) {
            // Amusant
            case 'dice':
                const diceRes = Math.floor(Math.random() * 7)
                message.channel.send(`${diceRes}`);
                break;
        }
    } catch (err) {
        console.error(err);
    }
});

client.login(config.default.botToken);