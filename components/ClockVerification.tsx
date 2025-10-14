'use client';

import { useState } from 'react';
import { verifySystemClock } from '@/lib/utils';
import type { ClockCheckResult } from '@/lib/types';

export default function ClockVerification() {
  const [clockCheck, setClockCheck] = useState<ClockCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    const result = await verifySystemClock();
    setClockCheck(result);
    setChecking(false);
  };

  if (!clockCheck) {
    return (
      <div className="bg-gray-100 border-2 border-purple-500 rounded-lg p-6">
        <h3 className="text-lg font-bold text-center mb-4">⏰ System Clock Verification</h3>
        <button
          onClick={handleCheck}
          disabled={checking}
          className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Verify System Clock'}
        </button>
      </div>
    );
  }

  return (
    <div className={`border-2 rounded-lg p-6 ${
      clockCheck.ok === true ? 'bg-green-50 border-green-500' :
      clockCheck.ok === false ? 'bg-red-50 border-red-500' :
      'bg-yellow-50 border-yellow-500'
    }`}>
      <h3 className="text-lg font-bold text-center mb-4">
        {clockCheck.ok === true ? '✅ Clock Verified' :
         clockCheck.ok === false ? '⚠️ CLOCK PROBLEM' :
         '⚠️ Cannot Verify Clock (Offline)'}
      </h3>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="font-semibold">Your Computer:</span>
          <span className="font-mono">{clockCheck.localTime}</span>
        </div>
        
        {clockCheck.serverTime && (
          <>
            <div className="flex justify-between">
              <span className="font-semibold">Internet Time:</span>
              <span className="font-mono">{clockCheck.serverTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Difference:</span>
              <span className="font-mono">{clockCheck.diffSeconds} seconds</span>
            </div>
          </>
        )}
        
        {clockCheck.error && (
          <p className="text-center text-gray-700 mt-2">
            Compare with your phone to verify time is correct
          </p>
        )}
      </div>
      
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleCheck}
          className="flex-1 py-2 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300"
        >
          Recheck
        </button>
        {clockCheck.ok === false && (
          <button
            onClick={() => setClockCheck(null)}
            className="flex-1 py-2 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500"
          >
            Ignore & Proceed
          </button>
        )}
      </div>
    </div>
  );
}