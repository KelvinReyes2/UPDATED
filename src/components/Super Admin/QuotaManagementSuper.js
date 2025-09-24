import React, { useEffect, useState } from "react";
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { db } from "../../firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { Wallet, Shield, RotateCcw, Calendar } from "lucide-react";

const auth = getAuth();

export default function QuotaManagementSuper() {
  const primaryColor = "#364C6E";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [currentQuota, setCurrentQuota] = useState(0);
  const [currentQuotaData, setCurrentQuotaData] = useState(null);
  const [newQuota, setNewQuota] = useState("");
  const [confirmQuota, setConfirmQuota] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState("Q1");
  const [quotaPeriod, setQuotaPeriod] = useState("quarterly");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [quotaMatchError, setQuotaMatchError] = useState(false);
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");
  
  // Fetch latest quota document to display current quota
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const q = query(
          collection(db, "quotaTarget"),
          orderBy("timestamp", "desc"),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data();
          setCurrentQuota(parseFloat(data.target) || 0);
          setCurrentQuotaData(data);
          
          // Set the current period and quarter from the fetched data
          if (data.period) {
            setQuotaPeriod(data.period);
          }
          if (data.quarter) {
            setSelectedQuarter(data.quarter);
          }
        }
      } catch (e) {
        console.error("Error fetching quota:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchQuota();
  }, []);

  // Get quarter start and end date based on selected quarter
  const getQuarterDates = (quarter) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-based (0 = January, 11 = December)
    
    // Determine which quarter we're currently in
    let currentQuarter;
    if (currentMonth <= 2) currentQuarter = "Q1"; // Jan-Mar
    else if (currentMonth <= 5) currentQuarter = "Q2"; // Apr-Jun
    else if (currentMonth <= 8) currentQuarter = "Q3"; // Jul-Sep
    else currentQuarter = "Q4"; // Oct-Dec
    
    // If setting a quota for a quarter that has already passed this year,
    // set it for next year
    const yearToUse = (quarter < currentQuarter || 
                      (quarter === currentQuarter && today.getDate() > 15)) 
                     ? currentYear + 1 
                     : currentYear;
    
    switch (quarter) {
      case "Q1":
        return {
          start: new Date(`${yearToUse}-01-01`),
          end: new Date(`${yearToUse}-03-31`),
        };
      case "Q2":
        return {
          start: new Date(`${yearToUse}-04-01`),
          end: new Date(`${yearToUse}-06-30`),
        };
      case "Q3":
        return {
          start: new Date(`${yearToUse}-07-01`),
          end: new Date(`${yearToUse}-09-30`),
        };
      case "Q4":
        return {
          start: new Date(`${yearToUse}-10-01`),
          end: new Date(`${yearToUse}-12-31`),
        };
      default:
        return { start: null, end: null };
    }
  };

  // Format date to readable format (e.g., "March 9, 2025")
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get current quota end date for display using formatted date
  const getCurrentQuotaEndDate = () => {
    if (!currentQuotaData?.endDate) return "Not set";
    return formatDate(currentQuotaData.endDate.toDate());
  };

  // Handle saving quota
  const handleSaveQuota = async () => {
    if (!newQuota || !confirmQuota) {
      return;
    }

    if (newQuota !== confirmQuota) {
      setQuotaMatchError(true);
      return;
    }

    setQuotaMatchError(false);
    setPassword("");
    setPasswordError("");
    setIsModalOpen(true);
  };

  // Handle password verification and saving the quota
  const handlePasswordSubmit = async () => {
    if (!password) {
      setPasswordError("Please enter your password.");
      return;
    }

    setSaving(true);

    try {
      const user = auth.currentUser;
      if (user) {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);

        const value = parseFloat(newQuota);
        if (isNaN(value) || value <= 0) {
          setQuotaMatchError(true);
          setSaving(false);
          setIsModalOpen(false);
          return;
        }

        // Calculate dates based on today's date and selected period
        const today = new Date();
        let start, end;

        if (quotaPeriod === "yearly") {
          start = new Date(today.getFullYear(), 0, 1); // January 1st of current year
          end = new Date(today.getFullYear(), 11, 31); // December 31st of current year
        } else {
          // For quarterly, use the selected quarter dates with proper year calculation
          const quarterDates = getQuarterDates(selectedQuarter);
          start = quarterDates.start;
          end = quarterDates.end;
        }

        await addDoc(collection(db, "quotaTarget"), {
          target: value.toString(),
          timestamp: new Date(),
          period: quotaPeriod,
          quarter: quotaPeriod === "quarterly" ? selectedQuarter : null,
          startDate: start,
          endDate: end,
        });

        setCurrentQuota(value);
        setCurrentQuotaData({
          target: value.toString(),
          period: quotaPeriod,
          quarter: quotaPeriod === "quarterly" ? selectedQuarter : null,
          startDate: { toDate: () => start },
          endDate: { toDate: () => end },
        });
        
        setNewQuota("");
        setConfirmQuota("");
        setPassword("");
        setPasswordError("");

        setToastMessage(`Quota updated successfully!`);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);

        setIsModalOpen(false);
      }
    } catch (e) {
      console.error("Error reauthenticating or saving quota:", e);
      setPasswordError("Incorrect password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Handle reset quota
  const handleResetQuota = () => {
    setResetPassword("");
    setResetPasswordError("");
    setIsResetModalOpen(true);
  };

  // Handle reset password verification
  const handleResetPasswordSubmit = async () => {
    if (!resetPassword) {
      setResetPasswordError("Please enter your password.");
      return;
    }

    setResetting(true);

    try {
      const user = auth.currentUser;
      if (user) {
        const credential = EmailAuthProvider.credential(user.email, resetPassword);
        await reauthenticateWithCredential(user, credential);

        // Reset form fields and enable inputs by clearing current quota data
        setNewQuota("");
        setConfirmQuota("");
        setQuotaMatchError(false);
        setResetPassword("");
        setResetPasswordError("");
        
        // Clear current quota data to enable fields
        setCurrentQuotaData(null);

        setToastMessage("Quota fields have been reset. You can now set a new quota.");
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);

        setIsResetModalOpen(false);
      }
    } catch (e) {
      console.error("Error reauthenticating:", e);
      setResetPasswordError("Incorrect password. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  // Handle modal close (cancel button)
  const handleCancelModal = () => {
    setIsModalOpen(false);
    setPassword("");
    setPasswordError("");
    setSaving(false);
  };

  // Handle reset modal close
  const handleCancelResetModal = () => {
    setIsResetModalOpen(false);
    setResetPassword("");
    setResetPasswordError("");
    setResetting(false);
  };

  // Check if fields should be disabled - if a quota exists and is set
  const shouldDisableFields = () => {
    return currentQuotaData !== null && !newQuota && !confirmQuota;
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* Main Content */}
      <main className="flex-1 p-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <div
            className="bg-white border rounded-xl shadow-sm flex flex-col p-9"
            style={{ minHeight: "calc(70vh - 112px)" }}
          >
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">
              Quota Management
            </h1>

            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="grid grid-cols-2 gap-10 mt-11">
                {/* Current Quota */}
                <div className="flex flex-col items-center justify-center border-r pr-10">
                  <h2 className="text-lg font-semibold text-gray-600 mb-2 flex items-center gap-2 mt-1">
                    <Wallet className="w-8 h-8 text-blue-600" />
                    Current Quota
                  </h2>
                  <div className="text-5xl font-bold text-gray-800 flex items-center gap-2">
                    <span>₱</span>
                    {currentQuota.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  
                  {/* Current Quota End Date */}
                  <div className="mt-6 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">Ends on:</span>
                    <span>{getCurrentQuotaEndDate()}</span>
                  </div>
                </div>

                {/* Quota Change */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-semibold text-gray-600">
                      Quota Change
                    </h2>
                    {/* Show reset button only if quota data exists */}
                    {currentQuotaData && (
                      <button
                        onClick={handleResetQuota}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 flex items-center justify-center"
                        title="Reset Quota Fields"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <p className="text-base text-gray-500 mb-4">
                    NOTE: If you want to modify the current quota, input the new
                    quota and retype the quota to confirm that you really want
                    to change it. This is applicable to all active drivers and
                    will add a new quota record.
                  </p>

                  {/* Quota Period Selection */}
                  <select
                    value={quotaPeriod}
                    onChange={(e) => setQuotaPeriod(e.target.value)}
                    disabled={shouldDisableFields()}
                    className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>

                  {/* Select Quarter for Quarterly Period */}
                  {quotaPeriod === "quarterly" && (
                    <select
                      value={selectedQuarter}
                      onChange={(e) => setSelectedQuarter(e.target.value)}
                      disabled={shouldDisableFields()}
                      className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="Q1">Q1 (Jan - Mar)</option>
                      <option value="Q2">Q2 (Apr - Jun)</option>
                      <option value="Q3">Q3 (Jul - Sep)</option>
                      <option value="Q4">Q4 (Oct - Dec)</option>
                    </select>
                  )}

                  <input
                    type="number"
                    placeholder="Enter new quota"
                    className={`w-full border rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-100 disabled:cursor-not-allowed ${quotaMatchError ? "bg-red-100 border-red-500" : ""}`}
                    value={newQuota}
                    onChange={(e) => setNewQuota(e.target.value)}
                    disabled={shouldDisableFields()}
                  />
                  <input
                    type="number"
                    placeholder="Confirm new quota"
                    className={`w-full border rounded-md px-3 py-2 mb-2 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-100 disabled:cursor-not-allowed ${quotaMatchError ? "bg-red-100 border-red-500" : ""}`}
                    value={confirmQuota}
                    onChange={(e) => setConfirmQuota(e.target.value)}
                    disabled={shouldDisableFields()}
                  />

                  {quotaMatchError && (
                    <div className="flex items-center space-x-2 mt-3">
                      <p className="text-red-500 text-sm font-semibold">
                        The quota values you entered do not match. Please ensure
                        that both the 'New Quota' and 'Confirm Quota' fields
                        contain the same value before proceeding.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveQuota}
                    disabled={shouldDisableFields()}
                    className="px-5 py-2 rounded-lg text-white shadow-md hover:opacity-95 self-start mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Password Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
          onClick={handleCancelModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-12 px-16 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-6">
              <Shield className="h-12 w-12 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 text-center mb-4">
              Please enter your password to confirm
            </h2>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
            />
            {passwordError && (
              <p className="text-red-500 text-sm font-semibold text-center mb-4">
                {passwordError}
              </p>
            )}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleCancelModal}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {saving && (
                  <svg
                    className="h-5 w-5 animate-spin inline-block mr-2"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"
                    />
                  </svg>
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
          onClick={handleCancelResetModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-12 px-16 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-6">
              <RotateCcw className="h-12 w-12 text-orange-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 text-center mb-4">
              Reset Quota Fields
            </h2>
            <p className="text-gray-600 text-center mb-4">
              Enter your password to reset and unlock the quota fields
            </p>
            <input
              type="password"
              placeholder="Password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-300"
            />
            {resetPasswordError && (
              <p className="text-red-500 text-sm font-semibold text-center mb-4">
                {resetPasswordError}
              </p>
            )}
            <div className="flex justify-center gap-4">
              <button
                onClick={handleCancelResetModal}
                disabled={resetting}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPasswordSubmit}
                disabled={resetting}
                className="px-4 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {resetting && (
                  <svg
                    className="h-5 w-5 animate-spin inline-block mr-2"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"
                    />
                  </svg>
                )}
                Reset Fields
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] transform transition-all duration-300 opacity-100 translate-y-0">
          <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-green-800 shadow-md w-[520px] max-w-[90vw]">
            <div className="mt-0.5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-green-500">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <div className="text-sm">
              <div className="font-semibold">{toastMessage}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}