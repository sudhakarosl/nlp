#!/usr/bin/env node
const program = require("commander");

const fs = require("fs");
const csv = require("csv-parser");
const compromise = require("compromise");
const Sentiment = require("sentiment");
const Headline = require("./models/Headline");
const Entity = require('./models/Entity')
const uuid = require('uuid');
const mongoose = require("mongoose");
const { log } = require("console");
const connect = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/nodenlpOpt");
    console.log("Connected to MongoDB.");
  } catch (error) {
    throw error;
  }
};

function consoleTime(startTime, endTime) {
    
  const diff = Math.abs(endTime - startTime);
  console.log(diff);
  const SEC = 1000, MIN = 60 * SEC, HRS = 60 * MIN;

  const hrs = Math.floor(diff / HRS);
  const min = Math.floor((diff % HRS) / MIN).toLocaleString('en-US', { minimumIntegerDigits: 2 });
  const sec = Math.floor((diff % MIN) / SEC).toLocaleString('en-US', { minimumIntegerDigits: 2 });
  const ms = Math.floor(diff % SEC).toLocaleString('en-US', { minimumIntegerDigits: 4, useGrouping: false });

//   console.log(`${hrs}hrs:${min}min:${sec}sec.${ms}ms`);
}
async function importHeadlines(csvFilePath, db) {
    console.time('Import Time');
    const headlines = [];
  
    try {
      const stream = fs.createReadStream(csvFilePath).pipe(csv());
  
      for await (const row of stream) {
        headlines.push({ headlineId: uuid.v4(), originalText: row.headline_text });
      }
  
      // Use bulkWrite to insert headlines in batches
      const batchSize = 1000; // Adjust the batch size as needed
      let currentIndex = 0;
  
      while (currentIndex < headlines.length) {
        const batch = headlines.slice(currentIndex, currentIndex + batchSize);
        currentIndex += batchSize;
  
        await db.collection('headlines').bulkWrite(
          batch.map((headline) => ({
            insertOne: {
              document: headline,
            },
          }))
        );
      }
  
      console.log("Import complete.");
  
      console.timeEnd('Import Time');
      console.log(`Imported ${headlines.length} headlines from CSV.`);
    } catch (error) {
      console.error('Error importing headlines:', error);
    }
  }
  

program.command("import-headlines <csvPath>")
.description("Import headlines from a CSV file into MongoDB")
.action(async (csvPath) => {
  const startTime = new Date();

  console.log("Importing headlines from CSV...");
  console.log(`CSV file path: ${csvPath}`);
  await connect();

  // Call the importHeadlines function with the provided CSV file path and database connection
  await importHeadlines(csvPath, mongoose.connection);

  mongoose.connection.close();

  const endTime = new Date();
  consoleTime(startTime, endTime);
});

program
.command("extract-entities")
.description("Extract entities and sentiment from headlines stored in MongoDB")
.action(async () => {
  const startTime = new Date();
  await connect();

  const batchSize = 60000; // Adjust the batch size as needed
  let offset = 0;
  let count = 0;

  while (true) {
    const headlines = await Headline.aggregate([
      { $skip: offset },
      { $limit: batchSize },
    ]).exec();

    if (headlines.length === 0) {
      break;
    }

    const bulkHeadlineUpdateOps = [];
    const bulkEntityUpdateOps = [];
    const sentimentAnalyzer = new Sentiment();

    await Promise.all(
      headlines.map(async (headline) => {
        const { originalText, _id } = headline;

        const doc = compromise(originalText);
        const persons = doc.people().out("array");
        const organizations = doc.organizations().out("array");
        const locations = doc.places().out("array");

        const sentimentAnalysis = sentimentAnalyzer.analyze(originalText);

        const sentiment = {
          score: sentimentAnalysis.score,
          comparative: sentimentAnalysis.comparative,
          positive: sentimentAnalysis.positive,
          negative: sentimentAnalysis.negative,
        };

        const formattedEntities = [
          ...persons.map((person) => ({ entityName: person, entityType: "person" })),
          ...organizations.map((org) => ({ entityName: org, entityType: "organization" })),
          ...locations.map((location) => ({ entityName: location, entityType: "location" })),
        ];

        // Prepare bulk update operations for headlines
        bulkHeadlineUpdateOps.push({
          updateOne: {
            filter: { _id },
            update: {
              $set: {
                entities: formattedEntities,
                sentiment: sentiment.score > 0 ? "positive" : sentiment.score < 0 ? "negative" : "neutral",
              },
            },
          },
        });

        // Prepare bulk update operations for entities
        formattedEntities.forEach((entity) => {
          bulkEntityUpdateOps.push({
            updateOne: {
              filter: { entityName: entity.entityName },
              update: {
                $inc: { count: 1 },
                $setOnInsert: entity,
              },
              upsert: true,
            },
          });
        });
      })
    );

    // Execute bulk update operations for headlines and entities
    await Headline.bulkWrite(bulkHeadlineUpdateOps);
    await Entity.bulkWrite(bulkEntityUpdateOps);

    offset += batchSize;
    count += 1;
    console.log(count);
  }

  mongoose.connection.close();
  console.log("All operations completed.");

  const endTime = new Date();
  consoleTime(startTime, endTime);
});



  
  program
  .command("top100entitieswithtype")
  .description("Show the top 100 entities with their types")
  .action(async () => {
    const startTime=new Date()
    await connect();

    const topEntities = await Entity.find()
      .sort({ count: -1 })  
      .limit(100) 
      .exec();

    // Display the top entities with their types
    console.log("Top 100 Entities:");
    topEntities.forEach((entity) => {
      console.log(`${entity.entityName} (${entity.entityType}) - Count: ${entity.count}`);
    });

    mongoose.connection.close();
    const endTime=new Date()
    consoleTime(startTime,endTime)

  });
  program
  .command("allheadlinesfor  <entityName>")
  .description("Show all headlines for a given entity name")
  .action(async (entityName) => {
    const startTime=new Date()
    await connect();

    const headlines = await Headline.find({ "entities.entityName": entityName }).exec();

    if (headlines.length === 0) {
      console.log(`No headlines found for entity '${entityName}'.`);
    } else {
      console.log(`Headlines for entity '${entityName}':`);
      headlines.forEach((headline) => {
        console.log(`- ${headline.originalText}`);
      });
    }

    mongoose.connection.close();
    const endTime=new Date()
consoleTime(startTime,endTime)
  });

  program
  .command("drop-collection")
  .description("Drop a MongoDB collection")
  .action(async () => {
    await connect();

    try {
     await Headline.deleteMany({});
     await Entity.deleteMany({});
      console.log(`Dropped collec`);
    } catch (error) {
      console.error(`Error dropping collection:`, error);
    }

    mongoose.connection.close();

  });
// ...

program.parse(process.argv);
