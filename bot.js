require('dotenv').config();

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const WOL_BASE_URL = process.env.WOL_BASE_URL?.replace(/\/$/, '');

if (!TOKEN) {
    throw new Error('Missing DISCORD_TOKEN environment variable');
}

if (!WOL_BASE_URL) {
    throw new Error('Missing WOL_BASE_URL environment variable');
}

const POST_URL = `${WOL_BASE_URL}/wol/`;
const STATUS_URL = `${WOL_BASE_URL}/wol/status.php`;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Configuration du serveur par défaut
let serverConfig = {
    ip: 'mc.xalri.ovh',
    version: '1.21.9',
    plugins: true,
    mods: false,
    driveLink: 'https://drive.xalri.ovh/s/WrzMbjP44xzKDRc',
    modsList: [],
    pluginsList: [
        {
            name: 'Trade Shop',
            link: 'https://www.spigotmc.org/resources/tradeshop.32762'
        }
    ]
};

// Charger la configuration depuis un fichier
const configPath = path.join(__dirname, 'server-config.json');
if (fs.existsSync(configPath)) {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        serverConfig = { ...serverConfig, ...JSON.parse(data) };
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
    }
}

console.log(serverConfig);

// Stockage des messages d'embed actifs pour la mise à jour automatique
let activeEmbedMessages = new Map(); // messageId -> { channelId, messageId }
let nextUpdateTime = Date.now() + 60000; // Prochaine mise à jour dans 1 minute

// Chemin pour stocker les embeds actifs
const embedsPath = path.join(__dirname, 'active-embeds.json');

// Sauvegarder la configuration
function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(serverConfig, null, 2));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration:', error);
    }
}

// Sauvegarder les embeds actifs
function saveActiveEmbeds() {
    try {
        const embedsData = Array.from(activeEmbedMessages.entries()).map(([messageId, data]) => ({
            messageId,
            channelId: data.channelId
        }));
        fs.writeFileSync(embedsPath, JSON.stringify(embedsData, null, 2));
        console.log(`Sauvegarde de ${embedsData.length} embed(s) actif(s)`);
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des embeds actifs:', error);
    }
}

// Charger les embeds actifs depuis le fichier
async function loadActiveEmbeds() {
    if (!fs.existsSync(embedsPath)) {
        console.log('Aucun fichier d\'embeds actifs trouvé');
        return;
    }

    try {
        const data = fs.readFileSync(embedsPath, 'utf8');
        const embedsData = JSON.parse(data);
        
        console.log(`Chargement de ${embedsData.length} embed(s) depuis le fichier...`);
        
        let loadedCount = 0;
        for (const embedData of embedsData) {
            try {
                const channel = await client.channels.fetch(embedData.channelId);
                if (channel) {
                    // Vérifier si le message existe encore
                    const message = await channel.messages.fetch(embedData.messageId).catch(() => null);
                    if (message) {
                        activeEmbedMessages.set(embedData.messageId, {
                            channelId: embedData.channelId,
                            channel: channel
                        });
                        loadedCount++;
                        console.log(`Embed rechargé: ${embedData.messageId}`);
                    } else {
                        console.log(`Message supprimé, ignoré: ${embedData.messageId}`);
                    }
                }
            } catch (error) {
                console.error(`Erreur lors du chargement de l'embed ${embedData.messageId}:`, error);
            }
        }
        
        console.log(`${loadedCount}/${embedsData.length} embed(s) rechargé(s) avec succès`);
        
        // Sauvegarder la liste nettoyée
        saveActiveEmbeds();
        
    } catch (error) {
        console.error('Erreur lors du chargement des embeds actifs:', error);
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    
    // Charger les embeds actifs depuis le fichier de sauvegarde
    await loadActiveEmbeds();
    
    // Démarrer la mise à jour automatique des embeds toutes les minutes
    startAutoUpdate();
});

// Fonction pour démarrer la mise à jour automatique
function startAutoUpdate() {
    // Run once immediately
    (async () => {
        console.log(`Mise à jour automatique: ${activeEmbedMessages.size} embed(s) actif(s)`);
        
        let hasChanges = false;
        
        for (const [messageId, messageData] of activeEmbedMessages) {
            try {
                const { channel, channelId } = messageData;
                
                // Récupérer le channel si nécessaire
                let targetChannel = channel;
                if (!targetChannel) {
                    targetChannel = await client.channels.fetch(channelId);
                    if (targetChannel) {
                        messageData.channel = targetChannel;
                    }
                }
                
                if (!targetChannel) {
                    activeEmbedMessages.delete(messageId);
                    hasChanges = true;
                    continue;
                }
                
                // Vérifier si le message existe encore
                const fetchedMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
                if (!fetchedMessage) {
                    activeEmbedMessages.delete(messageId);
                    hasChanges = true;
                    continue;
                }
                
                // Créer le nouvel embed et les boutons
                const newEmbed = await createServerEmbed();
                const newButtons = createServerControlButtons();
                
                // Mettre à jour le message
                await fetchedMessage.edit({
                    embeds: [newEmbed],
                    components: [newButtons]
                });
                
                console.log(`Embed mis à jour: ${messageId}`);
                
            } catch (error) {
                console.error(`Erreur lors de la mise à jour de l'embed ${messageId}:`, error);
                // Supprimer le message de la liste s'il y a une erreur
                activeEmbedMessages.delete(messageId);
                hasChanges = true;
            }
        }
        
        // Sauvegarder si il y a eu des changements
        if (hasChanges) {
            saveActiveEmbeds();
        }
    })();
    
    // Launch the interval
    setInterval(async () => {
        console.log(`Mise à jour automatique: ${activeEmbedMessages.size} embed(s) actif(s)`);
        
        // Mettre à jour le temps de la prochaine mise à jour
        nextUpdateTime = Date.now() + 60000;
        
        let hasChanges = false;
        
        for (const [messageId, messageData] of activeEmbedMessages) {
            try {
                const { channel, channelId } = messageData;
                
                // Récupérer le channel si nécessaire
                let targetChannel = channel;
                if (!targetChannel) {
                    targetChannel = await client.channels.fetch(channelId);
                    if (targetChannel) {
                        messageData.channel = targetChannel;
                    }
                }
                
                if (!targetChannel) {
                    activeEmbedMessages.delete(messageId);
                    hasChanges = true;
                    continue;
                }
                
                // Vérifier si le message existe encore
                const fetchedMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
                if (!fetchedMessage) {
                    activeEmbedMessages.delete(messageId);
                    hasChanges = true;
                    continue;
                }
                
                // Créer le nouvel embed et les boutons
                const newEmbed = await createServerEmbed();
                const newButtons = createServerControlButtons();
                
                // Mettre à jour le message
                await fetchedMessage.edit({
                    embeds: [newEmbed],
                    components: [newButtons]
                });
                
                console.log(`Embed mis à jour: ${messageId}`);
                
            } catch (error) {
                console.error(`Erreur lors de la mise à jour de l'embed ${messageId}:`, error);
                // Supprimer le message de la liste s'il y a une erreur
                activeEmbedMessages.delete(messageId);
                hasChanges = true;
            }
        }
        
        // Sauvegarder si il y a eu des changements
        if (hasChanges) {
            saveActiveEmbeds();
        }
    }, 60000); // 60000ms = 1 minute
  }
// Fonction pour obtenir le timestamp Discord de la prochaine mise à jour
function getNextUpdateTimestamp() {
    const timestamp = Math.floor(nextUpdateTime / 1000);
    return `<t:${timestamp}:R>`;
}

// Fonction pour mettre à jour tous les embeds actifs immédiatement
async function updateAllActiveEmbeds() {
    console.log(`Mise à jour manuelle: ${activeEmbedMessages.size} embed(s) actif(s)`);
    
    let hasChanges = false;
    
    for (const [messageId, messageData] of activeEmbedMessages) {
        try {
            const { channel, channelId } = messageData;
            
            // Récupérer le channel si nécessaire
            let targetChannel = channel;
            if (!targetChannel) {
                targetChannel = await client.channels.fetch(channelId);
                if (targetChannel) {
                    messageData.channel = targetChannel;
                }
            }
            
            if (!targetChannel) {
                activeEmbedMessages.delete(messageId);
                hasChanges = true;
                continue;
            }
            
            // Vérifier si le message existe encore
            const fetchedMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
            if (!fetchedMessage) {
                activeEmbedMessages.delete(messageId);
                hasChanges = true;
                continue;
            }
            
            // Créer le nouvel embed et les boutons
            const newEmbed = await createServerEmbed();
            const newButtons = createServerControlButtons();
            
            // Mettre à jour le message
            await fetchedMessage.edit({
                embeds: [newEmbed],
                components: [newButtons]
            });
            
            console.log(`Embed mis à jour manuellement: ${messageId}`);
            
        } catch (error) {
            console.error(`Erreur lors de la mise à jour manuelle de l'embed ${messageId}:`, error);
            // Supprimer le message de la liste s'il y a une erreur
            activeEmbedMessages.delete(messageId);
            hasChanges = true;
        }
    }
    
    // Sauvegarder si il y a eu des changements
    if (hasChanges) {
        saveActiveEmbeds();
    }
}

// Fonction pour créer l'embed du serveur
async function createServerEmbed() {
  const status = await getStatus() == "Online" ? ':green_circle:' : ':red_circle:';
  const statusColor = await getStatus() == "Online" ? 0x00AE86 : 0xFF0000;
  console.log("Status: " + status);
    const embed = new EmbedBuilder()
        .setTitle('📋 Informations du serveur Minecraft')
        .setColor(statusColor)
        .addFields(
            { name: '🌐 IP', value: `\`${serverConfig.ip}\``, inline: true },
            { name: '⚙️ STATUS', value: `${status}`, inline: true },
            { name: '🏷️ Version', value: `\`${serverConfig.version}\``, inline: false },
            // { name: '🔌 Plugins', value: serverConfig.pluginsList > 0 ? ':white_check_mark:' : ':x:', inline: false },
            // { name: '⚙️ Mods', value: serverConfig.modsList.length > 0 ? ':white_check_mark:' : ':x:', inline: true },
            { name: '🔄 Prochain check', value: getNextUpdateTimestamp(), inline: true }
        )
        .setTimestamp();

    

    // Ajouter la liste des mods
    if (serverConfig.modsList.length > 0) {
        embed.addFields({ name: '💾 Drive pour les mods', value: `[Ici](${serverConfig.driveLink})`, inline: false },)
        const modsText = serverConfig.modsList.map(mod => `- ${mod}`).join('\n');
        embed.addFields({ name: '🛠️ Mods:', value: modsText, inline: false });
    } else {
        embed.addFields({ name: '🛠️ Mods:', value: ':x:', inline: false });
    }

    // Ajouter la liste des plugins
    if (serverConfig.pluginsList.length > 0) {
        const pluginsText = serverConfig.pluginsList.map(plugin => 
            plugin.link ? `- [${plugin.name}](${plugin.link})` : `- ${plugin.name}`
        ).join('\n');
        embed.addFields({ name: '🔌 Plugins:', value: pluginsText, inline: true });
    } else {
        embed.addFields({ name: '🔌 Plugins:', value: ':x:', inline: true });
    }

    return embed;
}

// Fonction pour créer les boutons de contrôle du serveur
function createServerControlButtons() {
    const startButton = new ButtonBuilder()
        .setCustomId('startServer')
        .setLabel('🟢 Démarrer le serveur')
        .setStyle(ButtonStyle.Success);

    const stopButton = new ButtonBuilder()
        .setCustomId('stopServer')
        .setLabel('🔴 Éteindre le serveur')
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(startButton, stopButton);
}

// Commandes du bot
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.author.username !== "xalri") {
      console.log(`Commande de ${message.author.username}: ${message.content}`);
      return
    }

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // Commande pour afficher les informations du serveur
    if (command === '!serveur' || command === '!server') {
        const embed = await createServerEmbed();
        const buttons = createServerControlButtons();

        const sentMessage = await message.channel.send({ 
          embeds: [embed], 
          components: [buttons] 
        });

        // Ajouter le message à la liste des embeds actifs pour la mise à jour automatique
        activeEmbedMessages.set(sentMessage.id, {
            channelId: message.channel.id,
            channel: message.channel
        });

        console.log(`Nouvel embed ajouté pour mise à jour automatique: ${sentMessage.id}`);
        
        // Sauvegarder la liste des embeds actifs
        saveActiveEmbeds();

        await message.delete();
      }

    // Commandes de configuration
    if (command === '!config') {
        if (args.length < 3) {
            const usageMessage = await message.channel.send('❌ Usage: `!config <propriété> <valeur>`\nPropriétés disponibles: ip, version, plugins, mods, drive, add-mod, remove-mod, add-plugin, remove-plugin');
            setTimeout(() => usageMessage.delete().catch(console.error), 5000);
            await message.delete();
            return;
        }

        const property = args[1].toLowerCase();
        const value = args.slice(2).join(' ');

        let responseMessage;
        
        switch (property) {
            case 'ip':
                serverConfig.ip = value;
                responseMessage = await message.channel.send(`✅ IP du serveur mise à jour: \`${value}\``);
                break;
            
            case 'version':
                serverConfig.version = value;
                responseMessage = await message.channel.send(`✅ Version du serveur mise à jour: \`${value}\``);
                break;
            
            case 'plugins':
                const pluginsEnabled = value.toLowerCase() === 'true' || value.toLowerCase() === 'oui';
                serverConfig.plugins = pluginsEnabled;
                responseMessage = await message.channel.send(`✅ Plugins ${pluginsEnabled ? 'activés' : 'désactivés'}`);
                break;
            
            case 'mods':
                const modsEnabled = value.toLowerCase() === 'true' || value.toLowerCase() === 'oui';
                serverConfig.mods = modsEnabled;
                responseMessage = await message.channel.send(`✅ Mods ${modsEnabled ? 'activés' : 'désactivés'}`);
                break;
            
            case 'drive':
                serverConfig.driveLink = value;
                responseMessage = await message.channel.send(`✅ Lien Drive mis à jour: ${value}`);
                break;
            
            case 'add-mod':
                if (!serverConfig.modsList.includes(value)) {
                    serverConfig.modsList.push(value);
                    responseMessage = await message.channel.send(`✅ Mod ajouté: \`${value}\``);
                } else {
                    responseMessage = await message.channel.send(`❌ Le mod \`${value}\` existe déjà`);
                }
                break;
            
            case 'remove-mod':
                const modIndex = serverConfig.modsList.indexOf(value);
                if (modIndex > -1) {
                    serverConfig.modsList.splice(modIndex, 1);
                    responseMessage = await message.channel.send(`✅ Mod supprimé: \`${value}\``);
                } else {
                    responseMessage = await message.channel.send(`❌ Le mod \`${value}\` n'existe pas`);
                }
                break;
            
            case 'add-plugin':
                const pluginData = value.split('|'); // Format: "nom|lien" ou juste "nom"
                const pluginName = pluginData[0].trim();
                const pluginLink = pluginData[1] ? pluginData[1].trim() : null;
                if(pluginLink != null) {
                  if (!pluginLink.startsWith('http://') || !pluginLink.startsWith('https://')) {
                    pluginLink = 'https://' + pluginLink;
                  }
                }
                
                const existingPlugin = serverConfig.pluginsList.find(p => p.name === pluginName);
                if (!existingPlugin) {
                    serverConfig.pluginsList.push({ name: pluginName, link: pluginLink });
                    responseMessage = await message.channel.send(`✅ Plugin ajouté: \`${pluginName}\`${pluginLink ? ` avec lien: ${pluginLink}` : ''}`);
                } else {
                    responseMessage = await message.channel.send(`❌ Le plugin \`${pluginName}\` existe déjà`);
                }
                break;
            
            case 'remove-plugin':
                const pluginIndex = serverConfig.pluginsList.findIndex(p => p.name === value);
                if (pluginIndex > -1) {
                    serverConfig.pluginsList.splice(pluginIndex, 1);
                    responseMessage = await message.channel.send(`✅ Plugin supprimé: \`${value}\``);
                } else {
                    responseMessage = await message.channel.send(`❌ Le plugin \`${value}\` n'existe pas`);
                }
                break;
            
            default:
                responseMessage = await message.channel.send('❌ Propriété inconnue. Propriétés disponibles: ip, version, plugins, mods, drive, add-mod, remove-mod, add-plugin, remove-plugin');
                setTimeout(() => responseMessage.delete().catch(console.error), 5000);
                return;
        }
        
        // Supprimer le message de réponse après 3 secondes
        setTimeout(() => responseMessage.delete().catch(console.error), 3000);

        await message.delete();

        saveConfig();
        
        // Mettre à jour tous les embeds actifs avec la nouvelle configuration
        await updateAllActiveEmbeds();
    }

    // Commande pour gérer les embeds actifs
    if (command === '!embeds') {
        if (args[1] === 'clear' || args[1] === 'nettoyer') {
            const count = activeEmbedMessages.size;
            activeEmbedMessages.clear();
            saveActiveEmbeds(); // Sauvegarder après nettoyage
            const responseMsg = await message.channel.send(`✅ ${count} embed(s) supprimé(s) de la liste de mise à jour automatique.`);
            setTimeout(() => responseMsg.delete().catch(console.error), 3000);
        } else if (args[1] === 'list' || args[1] === 'liste') {
            const embedsList = Array.from(activeEmbedMessages.entries()).map(([id, data]) => `- ${id} (Channel: ${data.channelId})`).join('\n');
            const embedMessage = new EmbedBuilder()
                .setTitle('📋 Embeds actifs avec mise à jour automatique')
                .setColor(0x0099FF)
                .setDescription(embedsList || '*Aucun embed actif*')
                .addFields({ name: 'Total', value: `${activeEmbedMessages.size} embed(s)`, inline: true });
            const responseMsg = await message.channel.send({ embeds: [embedMessage] });
            setTimeout(() => responseMsg.delete().catch(console.error), 10000);
        } else {
            const responseMsg = await message.channel.send('❌ Usage: `!embeds <clear|list>` - Gère les embeds avec mise à jour automatique');
            setTimeout(() => responseMsg.delete().catch(console.error), 5000);
        }
        
        await message.delete();
    }

    // Commande d'aide
    if (command === '!aide' || command === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Aide du Bot Serveur Minecraft')
            .setColor(0x0099FF)
            .addFields(
                { name: '!serveur', value: 'Affiche les informations du serveur avec les boutons de contrôle', inline: false },
                { name: '!config ip <ip>', value: 'Change l\'IP du serveur', inline: false },
                { name: '!config version <version>', value: 'Change la version du serveur', inline: false },
                { name: '!config plugins <true/false>', value: 'Active/désactive les plugins', inline: false },
                { name: '!config mods <true/false>', value: 'Active/désactive les mods', inline: false },
                { name: '!config drive <url>', value: 'Change le lien du drive', inline: false },
                { name: '!config add-mod <nom>', value: 'Ajoute un mod à la liste', inline: false },
                { name: '!config remove-mod <nom>', value: 'Supprime un mod de la liste', inline: false },
                { name: '!config add-plugin <nom|lien>', value: 'Ajoute un plugin (lien optionnel après |)', inline: false },
                { name: '!config remove-plugin <nom>', value: 'Supprime un plugin de la liste', inline: false },
                { name: '!embeds list', value: 'Affiche la liste des embeds avec mise à jour automatique', inline: false },
                { name: '!embeds clear', value: 'Supprime tous les embeds de la mise à jour automatique', inline: false }
            );
        
        await message.reply({ embeds: [helpEmbed], ephemeral: true });
        
        await message.delete();
    }
});

// Gestion des interactions avec les boutons
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'startServer') {
        try {
            await interaction.deferReply({ ephemeral: true });
            const response = await switchStatus('wake');
            // console.log('Réponse du serveur (démarrage):', response);
            await interaction.editReply({ content: '🟢 **Serveur en cours de démarrage...**\nLe serveur devrait être accessible dans quelques instants.' });
        } catch (err) {
            console.error('Erreur lors du démarrage:', err);
            await interaction.editReply({ content: '❌ **Erreur lors du démarrage du serveur.**\nVeuillez réessayer plus tard.' });
        }
    }

    if (interaction.customId === 'stopServer') {
        try {
            await interaction.deferReply({ ephemeral: true });
            const response = await switchStatus('suspend');
            // console.log('Réponse du serveur (arrêt):', response);
            await interaction.editReply({ content: '🔴 **Serveur en cours d\'arrêt...**\nLe serveur sera fermé dans quelques instants.' });
        } catch (err) {
            console.error('Erreur lors de l\'arrêt:', err);
            await interaction.editReply({ content: '❌ **Erreur lors de l\'arrêt du serveur.**\nVeuillez réessayer plus tard.' });
        }
    }
});

client.login(TOKEN);


async function switchStatus(action = 'switch') {
    try {
        const formData = new URLSearchParams();
        formData.append('action', action);

        const response = await fetch(POST_URL, {
            method: 'POST',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'max-age=0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': 'PHPSESSID=9ff586bed467b6449d382d67d8d98bab',
                'Origin': WOL_BASE_URL,
                'Priority': 'u=0, i',
                'Referer': POST_URL,
                'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Opera GX";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Linux"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
            },
            body: formData
        });

        const responseText = await response.text();
        
        // console.log(`Statut: ${response.status} ${response.statusText}`);
        // console.log('En-têtes de réponse:', Object.fromEntries(response.headers.entries()));
        // console.log('Corps de la réponse:', responseText);
        
        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseText
        };
        
    } catch (error) {
        console.error('Erreur de fetch:', error);
        throw error;
    }
}

async function getStatus() {
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'switch');

        const response = await fetch(STATUS_URL, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.6,de;q=0.6',
                'Cache-Control': 'max-age=0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': 'PHPSESSID=9ff586bed467b6449d382d67d8d98bab',
                'Origin': WOL_BASE_URL,
                'Priority': 'u=0, i',
                'Referer': POST_URL,
                'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Opera GX";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/122.0.0.0'
            }
        });

        const responseText = await response.json();
        
        // console.log(`Status: ${response.status} ${response.statusText}`);
        // console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
        // console.log('Response Body:', responseText);
        
        return responseText.status ;
        
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}