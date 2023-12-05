// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { exit, env } = require("process");

function getRandomColor(seedString) {
  var hash = 0;
  for (var i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }

  var hex = "0x";
  for (var i = 0; i < 6; i++) {
    var value = (hash >> (i * 4)) & 0xf;
    hex += value.toString(16);
  }
  return hex;
}
let payload;
try {
  payload = require("./payload.json");
} catch (e) {
  console.log("No payload file found, running bot server only");
}

if (payload) {
  console.log(payload.event.action);
  const client = new Client({
    intents: [
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
    ],
  });
  client.login(token);

  if (payload.event.action === "created") {
    //check if labels include "synced-with-discord"
    if (
      payload.event.issue.labels.find(
        (label) => label.name === "synced-with-discord"
      )
    ) {
      client.destroy();
      console.log("issue already synced");
      exit();
    }
    client.once(Events.ClientReady, async (readyClient) => {
      let guild = readyClient.guilds.cache.get(env.DISCORD_SERVER_ID);
      let channels = guild.channels.cache;
      messageFetchPromises = [];
      channels.forEach(async (channel) => {
        if (
          channel.isThread() &&
          channel.archived === false &&
          channel.parentId === "1181557817749020682"
        ) {
          messageFetchPromises.push(
            channel.messages.fetch().then((messages) => {
              messages.forEach((message) => {
                if (
                  message.author.bot ||
                  message.author.username === env.DISCORD_ADMIN_USERNAME //need to figure out a way to check if admin instead
                ) {
                  if (message.cleanContent.includes("`synced with issue #")) {
                    let issueNumber = message.cleanContent
                      .split("#")
                      .pop()
                      .split("`")[0];
                    if (issueNumber === payload.event.issue.number.toString()) {
                      console.log(`syncing with issue #${issueNumber}`);
                      let newMessage = {
                        threadId: channel.id,
                        embeds: [
                          {
                            description: payload.event.comment.body,
                            url: payload.event.comment.html_url,
                            color: parseInt(
                              getRandomColor(payload.event.comment.user.login),
                              16
                            ),
                            author: {
                              name: payload.event.comment.user.login,
                              icon_url: payload.event.comment.user.avatar_url,
                              url: payload.event.comment.user.html_url,
                            },
                          },
                        ],
                      };
                      let thread = readyClient.channels.cache.get(channel.id);
                      thread.send(newMessage);
                    }
                  }
                }
              });
            })
          );
        }
      });
      await Promise.all(messageFetchPromises);
      console.log("done");
      await client.destroy();
    });
  }
  if (payload.event.action === "opened") {
    client.once(Events.ClientReady, (readyClient) => {
      let channel = readyClient.channels.cache.get(env.DISCORD_INPUT_FORUM_CHANNEL_ID);
      console.log(`New issue ${channel}`);
      let newMessage = {
        content: `\`synced with issue #${payload.event.issue.number}\``,
        embeds: [
          {
            title: `#${payload.event.issue.number} ${payload.event.issue.title}`,
            description: payload.event.issue.body,
            url: payload.event.issue.html_url,
            color: parseInt(getRandomColor(payload.event.issue.user.login), 16),
            author: {
              name: payload.event.issue.user.login,
              icon_url: payload.event.issue.user.avatar_url,
              url: payload.event.issue.user.html_url,
            },
          },
        ],
      };

      channel.threads.create({
        name: payload.event.issue.title,
        message: newMessage,
      });
      client.destroy();
    });
  }
} else {
  const client = new Client({
    intents: [
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
    ],
  });
  client.on(Events.ThreadCreate, async (thread) => {
    console.log("thread created");
    thread.fetchStarterMessage().then(async(message) => {  
        if (message.channel.parentId !== "1181557817749020682") return;
        if (message.author.bot) return;
        if (message.content.startsWith("`synced with issue #")) return;
        console.log(
          `Message received ${message.content} ${message.channel.parentId}`
        );
        const octokit = new Octokit({
          auth: env.GITHUB_TOKEN,
        });
    
        const issue = await octokit.rest.issues.create({
          owner: env.TARGET_REPO.split("/")[0],
          repo: env.TARGET_REPO.split("/")[1],
          title: message.channel.name,
          body: message.content,
          labels: ["synced-with-discord"],
        });
    });
  });
  client.login(token);
}
