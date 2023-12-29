// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, Message } = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { exit, env } = require("process");
const { getRandomColor } = require("./utils.js");
function isInputChannel(channel) {
  return channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID;
}

/**
 * @param {Message} inputMessage
 * @returns {Array[Number]} syncedIssues
 */
async function getSyncedIssues(inputMessage) {
  let syncedIssues = [];
  let messages = await inputMessage.channel.messages.fetch();
  messages.forEach((message) => {
    if (
      message.author.bot ||
      message.member.permissions.has("MANAGE_CHANNELS")
    ) {
      if (message.cleanContent.includes("`synced with issue #")) {
        syncedIssues.push(
          parseInt(message.cleanContent.split("#").pop().split("`")[0])
        );
      }
    }
  });
  console.log(syncedIssues);
  return syncedIssues;
}

function start() {
  const client = new Client({
    intents: [
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
    ],
  });

  //handle new message
  client.on(Events.MessageCreate, async (newMessage) => {
    if (!isInputChannel(newMessage.channel)) return;

    newMessage.channel.fetchStarterMessage().then(async (starterMessage) => {
      //handle new message in post
      if (newMessage.id !== starterMessage.id && !newMessage.author.bot) {
        const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
        //ffs there is a bug that means that message.channel returns the parent channel, not the thread, so I have to do this
        //find issue index if there is one
        syncedIssuesForPost = await getSyncedIssues(newMessage);
        syncedIssuesForPost.forEach((issueNumber) => {
          newMessage.author.avatarURL();
          content = `[<img src="${newMessage.author.avatarURL()}" width="15" height="15" center=true/> **${
            newMessage.author.username
          }** on Discord says](${newMessage.url}) \n> ${newMessage.content}`;
          octokit.rest.issues.createComment({
            owner: env.TARGET_REPO.split("/")[0],
            repo: env.TARGET_REPO.split("/")[1],
            body: content,
            issue_number: issueNumber,
          });
        });
      }
    });
  });

  client.on(Events.ThreadCreate, async (thread) => {
    //handle new thread/post
    console.log("thread created");
    thread.fetchStarterMessage().then(async (message) => {
      if (message.channel.parentId !== env.DISCORD_INPUT_FORUM_CHANNEL_ID)
        return;
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
      thread.send({
        content: `
        \`synced with issue #${issue.data.number}\` [follow on github](${issue.data.html_url})
        `,
        embeds: [
          {
            title: `#${issue.data.number} ${issue.data.title}`,
            description: issue.data.body,
            url: issue.data.html_url,
            color: parseInt(getRandomColor(message.author.username), 16),
            author: {
              name: message.author.username,
              icon_url: message.author.avatarURL(),
              url: issue.data.html_url,
            },
          },
        ],
      });
    });
  });
  client.login(token);
}
module.exports = { start };
