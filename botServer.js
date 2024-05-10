// Require the necessary discord.js classes
const {
  PermissionsBitField,
  Client,
  Events,
  GatewayIntentBits,
  Message,
} = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const readline = require("readline");
const { setGlobalDispatcher, Agent, Pool } = require("undici");

setGlobalDispatcher(
  new Agent({
    connect: { rejectUnauthorized: false, timeout: 60_000 },
    factory: (origin) => new Pool(origin, { connections: 128 }),
  })
); //this might fix possible connection timeout issues

//
const { Octokit, App } = require("octokit");
const { exit, env } = require("process");
const { getRandomColor } = require("./utils.js");
function isInputChannel(channel) {
  return channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID;
}

let app = require("express")();
app.use("/healthcheck", require("express-healthcheck")());
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
/**
 * @param {Message} inputMessage
 * @returns {Array[Number]} syncedIssues
 */
async function getSyncedIssues(inputMessage) {
  let syncedIssues = [];
  let messages = await inputMessage.channel.messages.fetchPinned();
  messages.forEach((message) => {
    if (message.cleanContent.includes("`synced with issue #")) {
      syncedIssues.push(
        parseInt(message.cleanContent.split("#").pop().split("`")[0])
      );
    }
  });
  console.log(syncedIssues);
  return syncedIssues;
}

/**
 * @param {Message} newMessage
 */
function processContent(newMessage) {
  let content = newMessage.content;
  let mentions = newMessage.mentions;

  //channel parsing
  content = content.replace(/<#(\d+)>/g, (match, id) => {
    if (!mentions.channels.get(id)) return match;
    return `[${mentions.channels.get(id).name}](https://discord.com/channels/${
      env.DISCORD_SERVER_ID
    }/${id})`;
  });
  //person parsing
  content = content.replace(/<@(\d+)>/g, (match, id) => {
    if (!mentions.users.get(id)) return match;
    return `[${mentions.users.get(id).username}](${newMessage.url})`;
  });
  //role parsing
  content = content.replace(/<@&(\d+)>/g, (match, id) => {
    if (!mentions.roles.get(id)) return match;
    return `[${mentions.roles.get(id).name}](${newMessage.url})`;
  });
  newMessage.attachments.forEach((attachment) => {
    content += `![${attachment.name}](${attachment.url})`;
  });

  return content;
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
          }** on Discord says](${newMessage.url}) \n> ${processContent(
            newMessage
          )}`;
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
    // sleep for a bit to make sure the thread is created
    await new Promise(r => setTimeout(r, 500));
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
        body: `[<img src="${message.author.avatarURL()}" width="15" height="15" center=true/> **${
          message.author.username
        }** on Discord says](${message.url}) \n> ${processContent(message)}`,
        labels: ["synced-with-discord"],
      });
      thread
        .send({
          content: `
        \`synced with issue #${issue.data.number}\` [follow on github](${issue.data.html_url})
        `,
          embeds: [
            {
              title: `#${issue.data.number} ${issue.data.title}`,
              description: message.content,
              url: issue.data.html_url,
              color: parseInt(getRandomColor(message.author.username), 16),
              author: {
                name: message.author.username,
                icon_url: message.author.avatarURL(),
                url: issue.data.html_url,
              },
            },
          ],
        })
        .then((message) => {
          message.pin();
        });
    });
  });
  client.login(token);
}
module.exports = { start };
