const { setGlobalOptions } = require("firebase-functions");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set the maximum number of instances for the functions to manage load
setGlobalOptions({ maxInstances: 10 });

// Create the function to disable a user based on their status in Firestore
exports.disableUserAccount = onDocumentUpdated("users/{userId}", async (change, context) => {
  const userId = context.params.userId; // Get the userId from Firestore document path
  const before = change.before.data(); // Get the data before the update
  const after = change.after.data(); // Get the updated data from Firestore

  // Log status change event for monitoring
  logger.info(`User ID ${userId} updated. Status changed from '${before.status}' to '${after.status}'`);

  // Check if the status has changed to "Inactive"
  if (after.status === "Inactive" && before.status !== "Inactive") {
    try {
      // Disable the user account in Firebase Authentication
      await admin.auth().updateUser(userId, { disabled: true });
      logger.info(`User account ${userId} has been disabled due to Inactive status.`);
    } catch (error) {
      logger.error(`Error disabling user account ${userId}: ${error.message}`);
    }
  } else {
    logger.info(`User account ${userId} status is not Inactive or no change in status. No action taken.`);
  }
});

// Sample "Hello World" function (you can remove or modify this as needed)
// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", { structuredData: true });
//   response.send("Hello from Firebase!");
// });
