// Require the necessary discord.js classes
const {
  PermissionsBitField,
  Client,
  Events,
  GatewayIntentBits,
} = require("discord.js");
const { exit, env } = require("process");
const token = env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { getRandomColor } = require("./utils.js");
const { ok } = require("assert");
const octokit = new Octokit({
  auth: env.GITHUB_TOKEN });

async function newComment(client, payload) {
  let issue = payload.event.issue
  let comment = payload.event.comment;
  // Check if the issue is already synced with Discord
  if (comment.user.login === "Discord-Github-Bridge") {
    console.log("comment by bot, ignoring");
    client.destroy();
    return;
  }
  let synced = false;
  if (issue.labels.find((label) => label.name === "synced-with-discord"))
    synced = true;
  if (!synced) {
    //add label
    // let issue_number = payload.event.issue?.number || payload.event.number;  
    await octokit.request(
      `POST /repos/${env.TARGET_REPO}/issues/${issue.number}/labels`,
      {
        owner: env.TARGET_REPO.split("/")[0],
        repo: env.TARGET_REPO.split("/")[1],
        issue_number: issue.number,
        labels: ["synced-with-discord"],
      }
    );
    // await octokit.rest.issues.addLabels({
    //   owner: env.TARGET_REPO.split("/")[0],
    //   repo: env.TARGET_REPO.split("/")[1],
    //   issue_number: 59,
    //   labels: ["synced-with-discord"],
    // });
    console.log("Tagged as synced with discord");
    createNewPost(client, payload, false)
    await new Promise(r => setTimeout(r, 2000));
  }

  const guild = client.guilds.cache.get(env.DISCORD_SERVER_ID);
  const channels = guild.channels.cache;
  const messageFetchPromises = [];

  // Fetch messages from appropriate channels
  channels.forEach((channel) => {
    if (isEligibleChannel(channel)) {
      messageFetchPromises.push(
        processChannelMessages(channel, issue, comment)
      );
    }
  });

  // Wait for all messages to be processed
  await Promise.all(messageFetchPromises);
  console.log("Processing complete");
  client.destroy();
}

// Helper function to determine if a channel is eligible
function isEligibleChannel(channel) {
  return (
    channel.isThread() &&
    !channel.archived &&
    channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID
  );
}

async function processChannelMessages(channel, issue, comment) {
  const messages = await channel.messages.fetchPinned();
  messages.forEach((message) => {
    if (shouldSyncMessage(message, issue.number.toString())) {
      console.log(`Syncing with issue #${issue.number}`);
      const newMessage = createMessagePayload(comment, channel.id);
      const thread = channel.client.channels.cache.get(channel.id);
      thread.send(newMessage); //no need to pin because this is a regular message
    }
  });
}

// Helper function to check if a message should be synced
function shouldSyncMessage(message, issueNumber) {
  return message.cleanContent.includes(`\`synced with issue #${issueNumber}\``);
}

// Function to create the message payload
function createMessagePayload(comment, channel_id) {
  return {
    threadId: channel_id,
    embeds: [
      {
        description: comment.body,
        url: comment.html_url,
        color: parseInt(getRandomColor(comment.user.login), 16),
        author: {
          name: comment.user.login,
          icon_url: comment.user.avatar_url,
          url: comment.user.html_url,
        },
      },
    ],
  };
}

function startClient(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
    ],
  });
  client.login(token);
  return client;
}
async function process(payload) {
  console.log(payload.event.action);

  if (payload.event.action === "created") {
    startClient(token).once(Events.ClientReady, async (client) => {
    newComment(client, payload);
    
    });
    //check if labels include "synced-with-discord"
  }
  if (payload.event.action === "opened") {
    startClient(token).once(Events.ClientReady, async (client) => {
      let issue_number = payload.event.issue?.number || payload.event.number;
      octokit.rest.issues
        .get({
          owner: env.TARGET_REPO.split("/")[0],
          repo: env.TARGET_REPO.split("/")[1],
          issue_number: issue_number,
        })
        .then((issue) => {
          if (
            issue.data.labels.find(
              (label) => label.name === "synced-with-discord"
            )
          ) {
            console.log("issue already tagged as synced on github");

            client.destroy();
            return;
          }
          octokit.rest.issues.addLabels({
            owner: env.TARGET_REPO.split("/")[0],
            repo: env.TARGET_REPO.split("/")[1],
            issue_number: issue_number,
            labels: ["synced-with-discord"],
          });
          createNewPost(client, payload);
        });
    });
  }
}

/**
 * @param {Client} client The client to use
 */
function createNewPost(client, payload, destroyClient = true) {
  console.log(
    "client ready with channel " + env.DISCORD_INPUT_FORUM_CHANNEL_ID
  );
  client.channels.fetch(env.DISCORD_INPUT_FORUM_CHANNEL_ID).then(async (channel) => {
    let issue_number = payload.event.issue?.number || payload.event.number;
    let issue = await new Octokit({ auth: env.GITHUB_TOKEN }).rest.issues.get({
      owner: env.TARGET_REPO.split("/")[0],
      repo: env.TARGET_REPO.split("/")[1],
      issue_number: issue_number,
    });
    console.log(`New issue ${channel}`);
    let newMessage = {
      content: `\`synced with issue #${issue_number}\` [follow on github](${issue.data.html_url})`,
      embeds: [
        {
          title: `#${issue.data.number} ${issue.data.title}`,
          description: issue.data.body || "",
          url: issue.data.html_url,
          color: parseInt(getRandomColor(issue.data.user.login), 16),
          author: {
            name: issue.data.user.login,
            icon_url: issue.data.user.avatar_url,
            url: issue.data.user.html_url,
          },
        },
      ],
    };
    
    let thread = await channel.threads.create({
      name: issue.data.title,
      message: newMessage,
    })
    thread.fetchStarterMessage().then((message) => {
      message.pin();
      if (destroyClient){
        client.destroy();
      }
    });
  });
}
module.exports = { process };
