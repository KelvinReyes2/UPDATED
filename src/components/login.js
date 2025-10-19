import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { KeyRound, Eye, EyeOff } from "lucide-react";

// import images
import MainLogo from "../images/withText.png";
import SideLogo from "../images/SideLogo.png";
import server from "../images/serverMaintenance.png";
import { motion } from "framer-motion";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // forgot password states
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetMessageType, setResetMessageType] = useState(""); // success, warning, error
  const [resetLoading, setResetLoading] = useState(false);

  // maintenance states
  const [systemStatus, setSystemStatus] = useState("Operational Mode");
  const [systemMessage, setSystemMessage] = useState("");

  const navigate = useNavigate();

  // Listen to Firestore system status in real-time
  useEffect(() => {
    const systemDocRef = doc(db, "system", "Status");
    const unsubscribe = onSnapshot(
      systemDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSystemStatus(data.status || "Operational Mode");
          setSystemMessage(data.message || "The system is under maintenance.");
        }
      },
      (error) => {
        console.error("Error fetching system status:", error);
      },
    );

    return () => unsubscribe();
  }, []); // Only subscribe once when component is mounted

  // Clean up old localStorage entries (password reset cache)
  useEffect(() => {
    const cleanupOldEntries = () => {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith("passwordReset_")) {
          const data = JSON.parse(localStorage.getItem(key) || "{}");
          const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
          if (data.timestamp && data.timestamp < twentyFourHoursAgo) {
            localStorage.removeItem(key);
          }
        }
      });
    };
    cleanupOldEntries();
  }, []);

  // Helper function to get user-friendly error messages
  const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
      case "auth/user-not-found":
        return "No user account found with that email address.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      case "auth/too-many-requests":
        return "Too many failed login attempts. Please try again later.";
      case "auth/invalid-credential":
        return "Incorrect email or password. Please try again.";
      case "auth/network-request-failed":
        return "Network error. Please check your connection and try again.";
      case "auth/operation-not-allowed":
        return "Email/password sign in is not enabled. Please contact support.";
      default:
        return (
          error.message || "An error occurred during login. Please try again."
        );
    }
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();

    // Check system maintenance
    if (systemStatus === "Maintenance Mode") {
      setError(
        "The system is currently under maintenance. Please try again later.",
      );
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Sign in
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // Force refresh the ID token to make sure Firestore sees the user as authenticated
      await user.getIdToken(true);

      // Fetch user document from Firestore
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", user.email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const role = (userData.role || "").toLowerCase();
        const status = userData.status;
        const isLogged = userData.isLogged || false;
        const firstName = userData.firstName || "Unknown";
        const lastName = userData.lastName || "User";
        const fullName = `${firstName} ${lastName}`;

        if (status === "Inactive") {
          setError("Your account is inactive. Please contact support.");
          setLoading(false);
          return;
        }

        // Check if user is already logged in on another device
        if (isLogged === true) {
          setError("This account is currently active in another session.");
          setLoading(false);
          return;
        }

        // Map role to display role for logging
        let displayRole;
        if (role === "super") {
          displayRole = "Super Admin";
        } else if (role === "admin") {
          displayRole = "System Admin";
        } else if (role === "cashier") {
          displayRole = "Cashier";
        } else {
          displayRole = role;
        }

        // Update isLogged to true
        await updateDoc(doc(db, "users", userDoc.id), {
          isLogged: true,
        });

        // Log login activity
        await addDoc(collection(db, "systemLogs"), {
          timestamp: serverTimestamp(),
          activity: "Logged in to the system",
          role: displayRole,
          performedBy: fullName,
        });

        // Navigate based on role
        switch (role) {
          case "super":
            navigate("/dashboardSuper");
            break;
          case "admin":
            navigate("/dashboardAdmin");
            break;
          case "cashier":
            navigate("/dashboardCashier");
            break;
          default:
            setError("Unknown role. Please contact the administrator.");
        }
      } else {
        setError("No user role found in the database.");
      }
    } catch (err) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Check for recent pending request in Firestore
  const hasRecentPendingRequest = async (email) => {
    const requestsRef = collection(db, "passwordRequestReset");
    const existingQuery = query(
      requestsRef,
      where("user", "==", email),
      where("status", "in", ["pending", "on hold"]), // Checking for both pending and on hold status
    );

    const existingSnapshot = await getDocs(existingQuery);

    return !existingSnapshot.empty; // If there are pending requests, return true
  };

  // Reset password request
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMessage("");
    setResetMessageType("");
    setResetLoading(true);

    try {
      // Check if user exists
      const usersRef = collection(db, "users");
      const userQuery = query(usersRef, where("email", "==", resetEmail));
      const userSnapshot = await getDocs(userQuery);

      if (userSnapshot.empty) {
        setResetMessage("No user account found with that email address.");
        setResetMessageType("error");
        setResetLoading(false);
        return;
      }

      const userDoc = userSnapshot.docs[0];
      const userRole = userDoc.data().role || "unknown";

      // If the user has the 'super' role, bypass the approval process and send a reset email
      if (userRole === "Super") {
        await sendPasswordResetEmail(auth, resetEmail);
        setResetMessage("Password reset email has been sent to your inbox.");
        setResetMessageType("success");
        setResetEmail("");
        setResetLoading(false);
        return;
      }

      // Check if there are any pending requests in Firestore
      const isRequestPending = await hasRecentPendingRequest(resetEmail);

      if (isRequestPending) {
        setResetMessage(
          "You already have a pending password reset request. Please wait for approval.",
        );
        setResetMessageType("warning");
        setResetLoading(false);
        return;
      }

      const requestsRef = collection(db, "passwordRequestReset");
      await addDoc(requestsRef, {
        user: resetEmail,
        role: userRole,
        status: "pending", // Set the status to pending initially
        requestedAt: serverTimestamp(),
        approvedBy: null,
      });

      setResetMessage(
        "Password reset request submitted successfully. Please wait for Super Admin's approval.",
      );
      setResetMessageType("success");
      setResetEmail("");
    } catch (err) {
      console.error("Reset password error:", err);
      setResetMessage("Error submitting request: " + err.message);
      setResetMessageType("error");
    } finally {
      setResetLoading(false);
    }
  };

  // Reset fields when closing the reset password frame
  const closeResetFrame = () => {
    setShowReset(false);
    setResetEmail("");
    setResetMessage("");
    setResetMessageType("");
    setResetLoading(false);
  };

  // Clear error when user starts typing
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (error) setError("");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Render maintenance mode screen
  if (systemStatus === "Maintenance Mode") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <svg
            className="absolute top-0 left-0 w-full h-full opacity-50"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
            viewBox="0 0 800 600"
          >
            <path
              d="M0,200 C150,300 350,100 500,200 C650,300 850,100 1000,200 L1000,00 L0,0 Z"
              fill="#196cd1ff"
              opacity="1"
            />
            <path
              d="M0,400 C200,500 400,300 600,400 C800,500 1000,300 1200,400 L1200,0 L0,0 Z"
              fill="#1a69e0ff"
              opacity="0.5"
            />
          </svg>
        </div>

        <div className="w-full max-w-[900px] flex flex-col items-center text-center px-6 z-10">
          {/* Server Image with BounceIn */}
          <div className="mb-8 flex justify-center">
            <motion.img
              src={server}
              alt="Server Maintenance"
              className="w-70 md:w-[420px] drop-shadow-lg"
              initial={{ scale: 0.3, opacity: 0, y: -100 }}
              animate={{
                scale: [0.3, 1.2, 0.9, 1.05, 1],
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 1.2,
                ease: "easeOut",
              }}
            />
          </div>

          <motion.h1
            className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight tracking-wide mt-20"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
          >
            System <br />
            <span className="text-blue-600 drop-shadow-2xl">Maintenance</span>
          </motion.h1>

          <motion.p
            className="text-gray-600 text-lg md:text-xl font-medium mt-4"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.8 }}
          >
            {systemMessage ||
              "We're currently working on improvements. Please check back soon."}
          </motion.p>
        </div>
      </div>
    );
  }

  // Normal login screen
  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
      {loading && (
        <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-blue-50 to-white backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center"
          >
            {/* Animated Bus Icon */}
            <div className="relative mb-8">
              {/* Road */}
              <motion.div
                className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-64 h-1 bg-gray-300 rounded-full overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <motion.div
                  className="h-full w-16 bg-gradient-to-r from-transparent via-gray-400 to-transparent"
                  animate={{ x: [-64, 256] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>

              {/* Bus */}
              <motion.div
                animate={{ 
                  x: [0, 10, 0],
                  y: [0, -2, 0]
                }}
                transition={{ 
                  duration: 0.8, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 120 120"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Bus Body */}
                  <rect x="20" y="35" width="80" height="50" rx="8" fill="url(#busGradient)" />
                  
                  {/* Windows */}
                  <rect x="28" y="42" width="25" height="18" rx="2" fill="#E0F2FE" />
                  <rect x="58" y="42" width="25" height="18" rx="2" fill="#E0F2FE" />
                  <rect x="88" y="42" width="8" height="18" rx="2" fill="#E0F2FE" />
                  
                  {/* Window Dividers */}
                  <rect x="52" y="42" width="2" height="18" fill="#0EA5E9" opacity="0.3" />
                  <rect x="82" y="42" width="2" height="18" fill="#0EA5E9" opacity="0.3" />
                  
                  {/* Door Line */}
                  <rect x="42" y="62" width="2" height="23" fill="#1E40AF" opacity="0.4" />
                  
                  {/* Headlights */}
                  <circle cx="25" cy="80" r="3" fill="#FCD34D">
                    <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                  </circle>
                  
                  {/* Front Bumper */}
                  <rect x="16" y="82" width="6" height="3" rx="1.5" fill="#1E40AF" />
                  
                  {/* Side Mirror */}
                  <rect x="12" y="45" width="4" height="6" rx="1" fill="#1E40AF" />
                  
                  {/* Left Wheel - Static outer circles */}
                  <circle cx="35" cy="88" r="8" fill="#374151" />
                  <circle cx="35" cy="88" r="6" fill="#1F2937" />
                  <circle cx="35" cy="88" r="3" fill="#4B5563" />
                  
                  {/* Left Wheel - Rotating spokes */}
                  <g transform="translate(35, 88)">
                    <motion.g
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <line x1="-5" y1="0" x2="5" y2="0" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="0" y1="-5" x2="0" y2="5" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="-3.5" y1="3.5" x2="3.5" y2="-3.5" stroke="#9CA3AF" strokeWidth="1.5" />
                    </motion.g>
                  </g>
                  
                  {/* Right Wheel - Static outer circles */}
                  <circle cx="85" cy="88" r="8" fill="#374151" />
                  <circle cx="85" cy="88" r="6" fill="#1F2937" />
                  <circle cx="85" cy="88" r="3" fill="#4B5563" />
                  
                  {/* Right Wheel - Rotating spokes */}
                  <g transform="translate(85, 88)">
                    <motion.g
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <line x1="-5" y1="0" x2="5" y2="0" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="0" y1="-5" x2="0" y2="5" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke="#9CA3AF" strokeWidth="1.5" />
                      <line x1="-3.5" y1="3.5" x2="3.5" y2="-3.5" stroke="#9CA3AF" strokeWidth="1.5" />
                    </motion.g>
                  </g>
                  
                  {/* Gradient Definition */}
                  <defs>
                    <linearGradient id="busGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4F46E5" />
                      <stop offset="100%" stopColor="#2563EB" />
                    </linearGradient>
                  </defs>
                </svg>
              </motion.div>

              {/* Exhaust Smoke - positioned at rear/bottom */}
              <motion.div
                className="absolute left-2 bottom-6"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: [0, 0.5, 0],
                  scale: [0, 1, 1.5],
                  x: [0, 8, -16],
                  y: [0, -3, -6]
                }}
                transition={{ 
                  duration: 1.8, 
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              >
                <div className="w-3 h-3 bg-gray-400 rounded-full blur-sm" />
              </motion.div>
              <motion.div
                className="absolute left-2 bottom-6"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: [0, 0.4, 0],
                  scale: [0, 1.3, 2],
                  x: [0, 8, 16],
                  y: [0, -3, -6]
                }}
                transition={{ 
                  duration: 1.8, 
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: 0.5
                }}
              >
                <div className="w-5 h-5 bg-gray-300 rounded-full blur-md" />
              </motion.div>
            </div>

            {/* Loading Text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <h3 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Signing you in
              </h3>
              <motion.p
                className="text-gray-600 font-medium"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Please wait a moment...
              </motion.p>
            </motion.div>

            {/* Loading Progress Dots */}
            <div className="flex gap-2 mt-6">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 bg-indigo-600 rounded-full"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Left: Login Form */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center px-6 py-8 animate-slideIn">
        <div className="flex flex-col items-center space-y-3">
          <img src={MainLogo} className="w-80 animate-fadeInUp" alt="Logo" />
          <h2 className="text-4xl font-bold tracking-tight animate-fadeInUp delay-100">
            Welcome Back!
          </h2>
          <p className="text-gray-600 animate-fadeInUp delay-200">
            Please enter your login details below
          </p>
        </div>

        {error && (
          <div className="w-full max-w-lg mt-4 px-4 py-3 rounded-lg text-sm font-medium bg-red-50 border border-red-300 text-red-700 animate-shake text-center">
            {error}
          </div>
        )}

        <form className="w-full max-w-lg mt-6 space-y-5" onSubmit={handleLogin}>
          <div className="animate-fadeInUp delay-300">
            <label className="block text-base font-semibold text-gray-700">
              Email
            </label>
            <input
              type="email"
              className={`mt-1 w-full p-4 text-base border rounded-lg shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-300 transition-all duration-300 ${
                error ? "border-red-300 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Enter email..."
              value={email}
              onChange={handleEmailChange}
              autoComplete="username"
              required
            />
          </div>

          <div className="animate-fadeInUp delay-400">
            <label className="block text-base font-semibold text-gray-700">
              Password
            </label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                className={`w-full p-4 pr-12 text-base border rounded-lg shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-300 transition-all duration-300 ${
                  error ? "border-red-300 bg-red-50" : "border-gray-300"
                }`}
                placeholder="Enter password..."
                value={password}
                onChange={handlePasswordChange}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:text-indigo-600 transition-colors duration-200 p-1"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={2} />
                ) : (
                  <Eye size={20} strokeWidth={2} />
                )}
              </button>
            </div>
            <div
              className="text-sm text-right mt-1 text-gray-500 hover:text-indigo-600 transition-all duration-200 cursor-pointer"
              onClick={() => setShowReset(true)}
            >
              Forgot Password?
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold py-3 rounded-lg shadow-lg hover:scale-105 hover:shadow-xl transform transition duration-300 text-lg animate-fadeInUp delay-500 disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>

      {/* Right: Image Section */}
      <div className="hidden md:block md:w-1/2 relative animate-slideInRight">
        <div className="w-full h-full rounded-l-3xl shadow-2xl overflow-hidden relative neon-box">
          <img
            src={SideLogo}
            className="w-full h-full object-cover object-center rounded-l-3xl scale-105 hover:scale-110 transition-transform duration-[6000ms] ease-in-out"
            alt="Background"
          />
          <div className="absolute inset-0 rounded-l-3xl bg-gradient-to-b from-red-700 via-indigo-800 to-blue-900 opacity-70 backdrop-brightness-90"></div>
        </div>
      </div>

      {/* Forgot Password Expanded Frame */}
      {showReset && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-lg relative animate-fadeInUp">
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-4">
                <KeyRound size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-bold text-gray-800">
                Reset Your Password
              </h3>
              <p className="text-gray-500 mt-2 mb-6 text-sm">
                Enter your registered email. Your request will be reviewed by
                the Super Admin.
              </p>
            </div>

            {/* Messages */}
            {resetMessage && (
              <div
                className={`w-full px-5 py-3 rounded-lg text-sm font-medium text-center mb-4 ${
                  resetMessageType === "error"
                    ? "bg-red-50 border border-red-300 text-red-700"
                    : resetMessageType === "success"
                      ? "bg-green-50 border border-green-300 text-green-700"
                      : "bg-yellow-50 border border-yellow-300 text-yellow-700"
                }`}
              >
                {resetMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-4 focus:ring-indigo-300 transition-all ${
                    resetMessageType === "error"
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  placeholder="Enter your email..."
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={resetLoading}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={resetLoading || resetMessageType === "success"}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold py-3 rounded-lg shadow-lg hover:scale-105 hover:shadow-xl transform transition duration-300 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {resetLoading ? "Submitting..." : "Submit Request"}
              </button>
            </form>

            {/* Close */}
            <button
              onClick={closeResetFrame}
              disabled={resetLoading}
              className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-5px); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease forwards; }
        .animate-fadeInUp { animation: fadeInUp 0.5s ease forwards; }
        .animate-slideIn { animation: slideIn 0.6s ease forwards; }
        .animate-slideInRight { animation: slideInRight 0.6s ease forwards; }
        .animate-shake { animation: shake 0.3s ease; }
      `}</style>
    </div>
  );
}

export default Login;