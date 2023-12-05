// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { token } = require('./config.json');

//
import { Octokit, App } from "octokit";

const app = new App({ appId, privateKey });

for await (const { octokit, repository } of app.eachRepository.iterator()) {
    // https://docs.github.com/en/rest/reference/repos#create-a-repository-dispatch-event
    await octokit.rest.repos.createDispatchEvent({
        owner: repository.owner.login,
        repo: repository.name,
        event_type: "my_event",
        client_payload: {
            foo: "bar",
        },
    });
    octokit.rest.listeners("my_event", {}, (response) => {
        console.log(response.data);
    })
    console.log("Event dispatched for %s", repository.full_name);
}

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async message => { // issue input listener
    // client.channels.fetch(message.channelId).then(channel => {
    //     let topic = channel.
    //     console.log(`Topic: ${topic}`)
    // })
    if (message.channelId!== '1181542597165064264') return;
    console.log(`Message received ${message.content} ${message.channel.type}`)
})
client.on(Events.MessageCreate, async message => { // issue webhook listener
    if (message.channelId!== '1181591779611508756') return;
    if (!message.embeds) return;
    console.log(message.embeds[0].title.split(']').pop().toString())
    let title = message.embeds[0].title.split(']').pop().toString().trim()
    if (title.startsWith("New comment on issue #")){
        processGithubCommentWebhook(message)
    }
})
function processGithubCommentWebhook(message) {
    let embed = message.embeds.pop()

    let channel =  client.channels.cache.get('1181542597165064264')
    let botAuthor = client.users.cache.get(client.user.id)
    let newMessage = {
        author: botAuthor,
        embeds: [embed]
    }
    channel.send(newMessage)
}
// Log in to Discord with your client's token
client.login(token);