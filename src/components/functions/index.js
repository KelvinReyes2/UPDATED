// const functions = require("firebase-functions");
// const admin = require("firebase-admin");

// admin.initializeApp();

// exports.createNewUser = functions.https.onCall(async (data, context) => {
//   // Ensure only authenticated admins can create users
//   if (!context.auth) {
//     throw new functions.https.HttpsError(
//       "unauthenticated",
//       "You must be logged in as an admin to perform this action."
//     );
//   }

//   try {
//     const userRecord = await admin.auth().createUser({
//       email: data.email,
//       password: data.password,
//       displayName: `${data.firstName} ${data.lastName}`,
//     });

//     // Save extra info in Firestore
//     await admin.firestore().collection("users").doc(userRecord.uid).set({
//       firstName: data.firstName,
//       middleName: data.middleName,
//       lastName: data.lastName,
//       role: data.role,
//       status: data.status,
//       address: data.address,
//       telNo: data.telNo,
//       permissions: data.permissions || [],
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     });
// //
//     return { uid: userRecord.uid }; // 👈 frontend gets this as result.data.uid
//   } catch (err) {
//     console.error("Error creating user:", err);
//     throw new functions.https.HttpsError(
//       "internal",
//       err.message || "Failed to create user"
//     );
//   }
// });
