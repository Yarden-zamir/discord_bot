// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { exit, env } = require("process");
const { getRandomColor } = require("./utils.js");

function newPostFromIssue(client, issue) {
  if (issue.labels.find((label) => label.name === "synced-with-discord")) {
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
        channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID
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
                  if (issueNumber === issue.number.toString()) {
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
function process(payload) {
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
    newPostFromIssue(client, payload.event.issue);
    //check if labels include "synced-with-discord"
  }
  if (payload.event.action === "opened") {
    client.once(Events.ClientReady, (readyClient) => {
      console.log(
        "client ready with channel " + env.DISCORD_INPUT_FORUM_CHANNEL_ID
      );
      readyClient.channels
        .fetch(env.DISCORD_INPUT_FORUM_CHANNEL_ID)
        .then((channel) => {
          console.log(`New issue ${channel}`);
          let newMessage = {
            content: `\`synced with issue #${payload.event.issue.number}\` [follow on github](${payload.event.issue.html_url})`,
            embeds: [
              {
                title: `#${payload.event.issue.number} ${payload.event.issue.title}`,
                description: payload.event.issue.body,
                url: payload.event.issue.html_url,
                color: parseInt(
                  getRandomColor(payload.event.issue.user.login),
                  16
                ),
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
    });
  }
}
