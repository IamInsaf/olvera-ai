const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const razorpay = new Razorpay({
  key_id: "xxxxxxxxxxxxxxxxxxxxxx",
  key_secret: "xxxxxxxxxxxxxxxxxxxxx",
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

/**
 * 🔹 Create Razorpay Order
 */
app.post("/createOrder", async (req, res) => {
  const { name, phone, userId } = req.body;

  if (!name || !phone || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const user = await admin.auth().getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    const order = await razorpay.orders.create({
      amount: 4900, // ₹49.00 in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { name, phone, userId },
    });

    await db.collection("payments").add({
      userId,
      name,
      phone,
      orderId: order.id,
      amount: 49,
      status: "created",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.send({ order });
  } catch (err) {
    console.error("Error creating Razorpay order:", err);
    if (err.code === "auth/user-not-found") {
      res.status(401).send({ error: "User not authenticated" });
    } else {
      res.status(500).send({ error: "Order creation failed" });
    }
  }
});

/**
 * 🔹 Verify Payment after frontend payment success
 */
app.post("/verifyPayment", async (req, res) => {
  const { orderId, paymentId, signature } = req.body;

  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const generatedSignature = crypto
      .createHmac("sha256", razorpay.key_secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (generatedSignature !== signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status === "captured") {
      const snapshot = await db.collection("payments").where("orderId", "==", orderId).get();
      if (snapshot.empty) {
        return res.status(404).json({ error: "Payment record not found" });
      }

      const docRef = snapshot.docs[0].ref;

      await docRef.update({
        paymentId,
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({ success: true, payment });
    } else {
      return res.status(400).json({ error: "Payment not captured" });
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

/**
 * 🔹 Razorpay Webhook for automatic updates
 */
app.post("/verifyWebhook", async (req, res) => {
  const webhookSecret = "12345"; // Replace with your webhook secret
  const signature = req.headers["x-razorpay-signature"];
  const body = JSON.stringify(req.body);

  try {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.warn("⚠️ Webhook signature verification failed");
      return res.status(400).send("Invalid signature");
    }

    const payment = req.body.payload.payment.entity;
    const orderId = payment.order_id;

    const snapshot = await db.collection("payments").where("orderId", "==", orderId).get();
    if (snapshot.empty) {
      return res.status(404).send("Order not found in database");
    }

    const docRef = snapshot.docs[0].ref;
    const paymentData = snapshot.docs[0].data();

    await docRef.update({
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount / 100,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (payment.status === "captured" && paymentData?.userId) {
      await db.collection("Olverausers").doc(paymentData.userId).set({
        hasPaid: true,
        paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    res.status(200).send("Webhook verified");
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Webhook processing failed");
  }
});

exports.paymentAPI = functions.https.onRequest(app); 
