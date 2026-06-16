const nodemailer = require("nodemailer");

const CONTACT_SUCCESS_MESSAGE = "Thank you! Your message has been sent. We will get back to you shortly.";

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
};

const isTooLong = (value, maxLength) => typeof value === "string" && value.trim().length > maxLength;

const parseBoolean = (value) => String(value || "true").toLowerCase() === "true";

const parseJsonBody = (body) => {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    return null;
  }
};

const getMissingMailConfig = () =>
  ["OWNER_EMAIL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"].filter((key) => !process.env[key]);

const hasMailConfig = () => getMissingMailConfig().length === 0;

const getSafeMailErrorMessage = (error) => {
  if (error?.code === "EAUTH" || error?.responseCode === 535) {
    return "Gmail rejected the sender login. Check SMTP_USER and use the Gmail app password without spaces.";
  }

  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT"].includes(error?.code)) {
    return "The email server could not be reached. Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE.";
  }

  if (error?.responseCode) {
    return `Email server rejected the message with code ${error.responseCode}.`;
  }

  return "Unable to send your message right now. Check the Netlify function logs for details.";
};

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: parseBoolean(process.env.SMTP_SECURE),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const validateContactMessage = (payload) => {
  if (
    isTooLong(payload.name, 120) ||
    isTooLong(payload.email, 160) ||
    isTooLong(payload.contactNumber || "", 40) ||
    isTooLong(payload.message, 3000) ||
    isTooLong(payload.aquaConfirm || "", 120) ||
    isTooLong(payload.website || "", 120)
  ) {
    return { error: "One or more fields are too long." };
  }

  const messageData = {
    name: normalizeText(payload.name, 120),
    email: normalizeText(payload.email, 160),
    contactNumber: normalizeText(payload.contactNumber || "", 40),
    message: normalizeText(payload.message, 3000),
    aquaConfirm: normalizeText(payload.aquaConfirm || payload.website || "", 120),
  };

  if (messageData.aquaConfirm) {
    return { silentlyIgnored: true };
  }

  if (!messageData.name || !messageData.email || !messageData.message) {
    return { error: "Please complete the required contact fields." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(messageData.email)) {
    return { error: "Please enter a valid email address." };
  }

  return { messageData };
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Only POST requests are allowed." });
  }

  const payload = parseJsonBody(event.body);
  if (!payload) {
    return jsonResponse(400, { message: "Invalid JSON body." });
  }

  const { messageData, error, silentlyIgnored } = validateContactMessage(payload);
  if (silentlyIgnored) {
    console.info("Contact message ignored by honeypot field.");
    return jsonResponse(200, { message: CONTACT_SUCCESS_MESSAGE });
  }

  if (error) {
    return jsonResponse(400, { message: error });
  }

  if (!hasMailConfig()) {
    const missingConfig = getMissingMailConfig();
    console.warn("Contact email service missing environment variables.", missingConfig);
    return jsonResponse(503, {
      message: `Email service is missing: ${missingConfig.join(", ")}.`,
    });
  }

  const submittedAt = new Date().toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
  const contactNumber = messageData.contactNumber || "Not provided";
  const safeMessage = escapeHtml(messageData.message).replace(/\n/g, "<br>");

  try {
    const transporter = createTransporter();
    const mailInfo = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.OWNER_EMAIL,
      replyTo: messageData.email,
      subject: "New Website Message - AquaDrip",
      text: [
        "A new contact message was sent from the website.",
        "",
        `Sender name: ${messageData.name}`,
        `Sender email: ${messageData.email}`,
        `Contact number: ${contactNumber}`,
        "",
        "Message:",
        messageData.message,
        "",
        `Submitted: ${submittedAt}`,
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; color: #16385d; line-height: 1.6;">
          <h2 style="margin-bottom: 12px;">New Website Message</h2>
          <p style="margin-top: 0;">A visitor sent a message from the website contact page.</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
            <tbody>
              <tr><td style="padding: 8px 0; font-weight: 700;">Sender name</td><td style="padding: 8px 0;">${escapeHtml(messageData.name)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 700;">Sender email</td><td style="padding: 8px 0;">${escapeHtml(messageData.email)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 700;">Contact number</td><td style="padding: 8px 0;">${escapeHtml(contactNumber)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 700;">Submitted</td><td style="padding: 8px 0;">${escapeHtml(submittedAt)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 700; vertical-align: top;">Message</td><td style="padding: 8px 0;">${safeMessage}</td></tr>
            </tbody>
          </table>
        </div>
      `,
    });
    console.info("Contact email accepted by SMTP.", {
      messageId: mailInfo.messageId,
      response: mailInfo.response,
      accepted: mailInfo.accepted,
      rejected: mailInfo.rejected,
    });

    return jsonResponse(200, { message: CONTACT_SUCCESS_MESSAGE });
  } catch (mailError) {
    console.error("Unable to send contact email.", mailError);
    return jsonResponse(500, { message: getSafeMailErrorMessage(mailError) });
  }
};
