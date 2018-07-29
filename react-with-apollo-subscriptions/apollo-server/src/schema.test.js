const test = require('ava');
const { createSchema } = require('./schema');
const { graphql } = require('graphql');

test(
    'Mutation addComment then query allComments',
    async t => {
        const schema = createSchema();
        const query = `
            mutation {
                addComment(content: "Hello World") {
                    content
                }
            } 
        `
        const expected = {
            content: 'Hello World'
        }

        const executionResult = await graphql(schema, query, undefined, {});
        t.deepEqual(executionResult.data.addComment, expected);
    }
);


function createHybridApolloClient() {
    const { getMainDefinition } = require('apollo-utilities');
    const gql = require('graphql-tag');
    const ws = require('ws');
    const { ApolloClient } = require('apollo-client');
    const { ApolloLink, split } = require('apollo-link');
    const { createHttpLink } = require('apollo-link-http');
    const nodeFetch = require('node-fetch');
    const { WebSocketLink } = require('apollo-link-ws');
    const { SubscriptionClient } = require('subscriptions-transport-ws');
    const { InMemoryCache } = require('apollo-cache-inmemory');
    const GRAPHQL_ENDPOINT = 'http://localhost:5000/graphql';
    const GRAPHQL_WS_ENDPOINT = 'ws://localhost:5000/subscriptions';

    const httpLink = createHttpLink({ uri: GRAPHQL_ENDPOINT, fetch: nodeFetch });
    let connectedSuccessfullyResolve;
    const wsLink = new WebSocketLink({
        uri: GRAPHQL_WS_ENDPOINT,
        options: {
            connectionCallback() {
                if(connectedSuccessfullyResolve) {
                    connectedSuccessfullyResolve();
                }
            },
            reconnect: true
        },
        webSocketImpl: ws
    });
    const link = split(
        ({ query }) => {
            const { kind, operation } = getMainDefinition(query);
            return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        httpLink,
    );
    const apolloClient = new ApolloClient({ link, cache: new InMemoryCache(), ssrMode: true });
    apolloClient.wsConnectedSuccessfully = () => {
        return new Promise(resolve => {
            connectedSuccessfullyResolve = resolve;
        });
    }
    return apolloClient;
}

async function startApolloTestServer() {
    const http = require('http');
    const express = require('express');
    const { ApolloServer } = require('apollo-server-express');
    
    const schema = createSchema();
    let connectReceivedResolve;
    const apolloServer = new ApolloServer({ 
        schema,
        subscriptions: {
            path: '/subscriptions',
            onConnect() {
                if(connectReceivedResolve) {
                    connectReceivedResolve();
                }
            },
        }
    });
    const app = express();
    const httpServer = http.createServer(app);
    apolloServer.applyMiddleware({ app });
    apolloServer.installSubscriptionHandlers(httpServer)

    return new Promise(resolve => {
        httpServer.listen(5000, (err) => {
            httpServer.wsConnectReceived = () => {
                return new Promise(resolve => {
                    connectReceivedResolve = resolve;
                });
            }
            setTimeout(
                () => resolve(httpServer),
                200
            );
        });

    });
}

// https://www.apollographql.com/docs/react/advanced/subscriptions.html
// better split
test(
    'Mutation addComment triggers commentAdded subscription',
    async t => {
        const gql = require('graphql-tag');
        const apolloServer = await startApolloTestServer();
        const apolloClient = createHybridApolloClient();

        let addedComment;
        apolloClient.subscribe({
          query: gql`
            subscription onCommentAdded {
                commentAdded { content }
            }`
        }).subscribe(({ data }) => { 
            addedComment = data.commentAdded;
        });

        await apolloServer.wsConnectReceived();
        await apolloClient.wsConnectedSuccessfully();

        const mutationResult = await apolloClient.mutate({
          mutation: gql`
            mutation {
                addComment(content: "Life is but a dream") {
                    content
                }
            } 
          `,
        });
        const expectedComment = mutationResult.data.addComment;

        t.deepEqual(addedComment, expectedComment);
    }
);
