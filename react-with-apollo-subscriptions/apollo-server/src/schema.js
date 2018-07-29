const { makeExecutableSchema } = require('graphql-tools');
const { PubSub } = require('graphql-subscriptions');

const typeDefs = `
  type Comment {
    id: String
    content: String
  }

  type Query {
    allComments: [Comment]
  }

  type Mutation {
    addComment (content: String!): Comment
  }

  type Subscription {
    commentAdded: Comment
  }
`;

module.exports = { 
  createSchema() {
    let comments = [];
    const pubsub = new PubSub();

    const resolvers = {
      Query: {
        allComments: (_) => comments,
      },
      Mutation: {
        addComment: (_, comment) => { 
          comments.push(comment);
          pubsub.publish('commentAdded', { commentAdded: comment });
          return comment;
        },
      },
      Subscription: {
        // To filter comments: https://www.apollographql.com/docs/graphql-subscriptions/setup.html#filter-subscriptions
        commentAdded: {
          subscribe: () => {
            return pubsub.asyncIterator('commentAdded')
          }
        }
      },
    };
  
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    return schema;
  }
};