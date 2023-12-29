// Require the necessary discord.js classes
const { PermissionsBitField, Client, Events, GatewayIntentBits } = require("discord.js");
const { exit, env } = require("process");
const token = env.DISCORD_TOKEN;
const readline = require("readline");

//
const { Octokit, App } = require("octokit");
const { getRandomColor } = require("./utils.js");

function newComment(client, issue, comment) {
  // Check if the issue is already synced with Discord
  if (comment.user.login === "Discord-Github-Bridge") {
    console.log("comment by bot, ignoring");
    client.once(Events.ClientReady, async (readyClient) => {
      readyClient.destroy();
    });
    return;
  }
  let synced = false;
  if (issue.labels.find((label) => label.name === "synced-with-discord"))
    synced = true;
  if (!synced) {
    //add label
    const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    octokit.rest.issues.addLabels({
      owner: env.TARGET_REPO.split("/")[0],
      repo: env.TARGET_REPO.split("/")[1],
      issue_number: issue.number,
      labels: ["synced-with-discord"],
    });
  }

  // When the client is ready, start processing
  client.once(Events.ClientReady, async (readyClient) => {
    const guild = readyClient.guilds.cache.get(env.DISCORD_SERVER_ID);
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
  });
}

// Helper function to determine if a channel is eligible
function isEligibleChannel(channel) {
  return (
    channel.isThread() &&
    !channel.archived &&
    channel.parentId === env.DISCORD_INPUT_FORUM_CHANNEL_ID
  );
}

// Function to process messages in a channel
async function processChannelMessages(channel, issue, comment) {
  const messages = await channel.messages.fetch();
  messages.forEach((message) => {
    if (shouldSyncMessage(message, issue.number.toString())) {
      console.log(`Syncing with issue #${issue.number}`);
      const newMessage = createMessagePayload(comment, channel.id);
      const thread = channel.client.channels.cache.get(channel.id);
      thread.send(newMessage);
    }
  });
}

// Helper function to check if a message should be synced
function shouldSyncMessage(message, issueNumber) {
  return (
    (message.author.bot || isMessageFromAdmin(message)) &&
    message.cleanContent.includes(`\`synced with issue #${issueNumber}\``)
  );
}

// Function to check if a message is from an admin
function isMessageFromAdmin(message) {
  return (
    message.author.bot || message.member.user.id === "Yarden.zamir"
  );
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
function process(payload) {
  console.log(payload.event.action);

  if (payload.event.action === "created") {
    const client = startClient(token);
    newComment(client, payload.event.issue, payload.event.comment);
    //check if labels include "synced-with-discord"
  }
  if (payload.event.action === "opened") {
    const client = startClient(token);
    const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    let labels = octokit.rest.issues
      .get({
        owner: env.TARGET_REPO.split("/")[0],
        repo: env.TARGET_REPO.split("/")[1],
        issue_number: payload.event.issue.number,
      })
      .then((issue) => {
        if (
          issue.data.labels.find(
            (label) => label.name === "synced-with-discord"
          )
        ) {
          console.log("issue already synced");
          client.destroy();
          return;
        }
        octokit.rest.issues.addLabels({
          owner: env.TARGET_REPO.split("/")[0],
          repo: env.TARGET_REPO.split("/")[1],
          issue_number: payload.event.issue.number,
          labels: ["synced-with-discord"],
        });
        createNewPost(client, payload);
      });
  }
}

function createNewPost(client, payload) {
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
module.exports = { process };
