// ==UserScript==
// @name         Enhanced Persistent Site Timer Overlay
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Show a big live timer overlay per domain, persistent across tabs and browser sessions
// @author       You
// @match        *://*/*
// @match        *://wintwealth.com/*
// @match        *://*.wintwealth.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Use hostname as key (so www.youtube.com has its own timer, etc.)
    const domain = location.hostname;

    // Storage helper functions
    function getStoredTimers() {
        try {
            return JSON.parse(localStorage.getItem("siteTimers") || "{}");
        } catch (e) {
            console.warn("Failed to parse stored timers, resetting:", e);
            return {};
        }
    }

    function saveTimers(timers) {
        try {
            localStorage.setItem("siteTimers", JSON.stringify(timers));
        } catch (e) {
            console.error("Failed to save timers:", e);
        }
    }

    // Get current date string for daily reset
    function getCurrentDateKey() {
        return new Date().toDateString(); // e.g., "Mon Aug 16 2025"
    }

    // Initialize timer data for this domain
    function initializeDomainTimer() {
        let stored = getStoredTimers();
        let now = Date.now();
        let today = getCurrentDateKey();

        if (!stored[domain] || stored[domain].date !== today) {
            // Reset timer for new day or first time
            stored[domain] = {
                totalTime: 0,  // Total accumulated time in milliseconds for today
                sessionStart: now,  // When current session started
                date: today         // Current date to track daily reset
            };
        } else {
            // Same day, just update session start without resetting totalTime
            stored[domain].sessionStart = now;
        }

        saveTimers(stored);
        return stored[domain];
    }

    // Update the timer data (save current session time to totalTime)
    function updateTimerData() {
        let stored = getStoredTimers();
        let data = stored[domain];
        let now = Date.now();

        if (data && data.sessionStart) {
            // Add current session time to total time
            let sessionTime = now - data.sessionStart;
            data.totalTime += sessionTime;
            data.sessionStart = now; // Reset session start
            stored[domain] = data;
            saveTimers(stored);
        }

        return data;
    }

    // Get current elapsed time for display
    function getCurrentElapsedTime() {
        let stored = getStoredTimers();
        let data = stored[domain];

        if (!data) return 0;

        let today = getCurrentDateKey();
        if (data.date !== today) {
            // New day detected, reset timer
            initializeDomainTimer();
            return 0;
        }

        let now = Date.now();
        let currentSessionTime = now - data.sessionStart;
        return data.totalTime + currentSessionTime;
    }

    // Format time for display
    function formatTime(milliseconds) {
        let totalSeconds = Math.floor(milliseconds / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // Show notification banner
    function showNotificationBanner(minutes) {
        // Remove any existing banner
        const existingBanner = document.getElementById('site-timer-banner');
        if (existingBanner) {
            existingBanner.remove();
        }

        // Create banner
        const banner = document.createElement('div');
        banner.id = 'site-timer-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 20px 40px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 24px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-weight: bold;
            border-radius: 12px;
            z-index: 1000000;
            text-align: center;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            animation: bannerSlideIn 0.3s ease-out;
        `;

        // Add CSS animation
        if (!document.getElementById('banner-style')) {
            const style = document.createElement('style');
            style.id = 'banner-style';
            style.textContent = `
                @keyframes bannerSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
                @keyframes bannerSlideOut {
                    from {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        banner.textContent = `Used ${minutes} minutes on ${domain}`;

        // Add to page
        if (document.body) {
            document.body.appendChild(banner);
        } else {
            document.documentElement.appendChild(banner);
        }

        // Remove after 1 second with fade out animation
        setTimeout(() => {
            banner.style.animation = 'bannerSlideOut 0.3s ease-in';
            setTimeout(() => {
                if (banner.parentNode) {
                    banner.remove();
                }
            }, 300);
        }, 1000);
    }

    // Track last notification to avoid duplicates
    let lastNotificationMinutes = 0;

    // Initialize timer for this domain
    let timerData = initializeDomainTimer();

    // Create overlay box
    let box = document.createElement("div");
    box.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        background: rgba(0, 0, 0, 0.3);
        color: rgba(255, 255, 255, 0.8);
        font-size: 16px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-weight: normal;
        border-radius: 8px;
        z-index: 999999;
        user-select: none;
        cursor: move;
        min-width: 60px;
        text-align: center;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(5px);
    `;

    let timeDisplay = document.createElement("div");
    timeDisplay.style.cssText = `
        font-size: 16px;
        font-weight: normal;
        text-align: center;
    `;

    box.appendChild(timeDisplay);

    // Wait for body to be available - improved for dynamic sites
    function addToDOM() {
        // Try multiple ways to ensure the timer gets added
        if (document.body) {
            document.body.appendChild(box);
            console.log(`Site timer added to DOM for ${domain}`);
        } else if (document.documentElement) {
            document.documentElement.appendChild(box);
            console.log(`Site timer added to documentElement for ${domain}`);
        } else {
            setTimeout(addToDOM, 100);
        }
    }

    // Try to add immediately, then retry with delays
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addToDOM);
    } else {
        addToDOM();
    }

    // Fallback - try again after window load
    window.addEventListener('load', function() {
        if (!document.body.contains(box)) {
            addToDOM();
        }
    });

    // Make draggable
    let isDragging = false;
    box.onmousedown = function(e) {
        isDragging = false;
        let shiftX = e.clientX - box.getBoundingClientRect().left;
        let shiftY = e.clientY - box.getBoundingClientRect().top;

        function moveAt(pageX, pageY) {
            isDragging = true;
            box.style.left = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, pageX - shiftX)) + 'px';
            box.style.top = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, pageY - shiftY)) + 'px';
            box.style.right = "auto";
        }

        function onMouseMove(e) {
            moveAt(e.pageX, e.pageY);
        }

        document.addEventListener('mousemove', onMouseMove);

        function cleanup() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', cleanup);
            setTimeout(() => { isDragging = false; }, 10);
        }

        document.addEventListener('mouseup', cleanup);
    };

    box.ondragstart = () => false;

    // Update display
    function updateDisplay() {
        let elapsed = getCurrentElapsedTime();
        timeDisplay.textContent = formatTime(elapsed);

        // Check for milestone notifications (every 5 minutes)
        let currentMinutes = Math.floor(elapsed / (1000 * 60));
        if (currentMinutes > 0 && currentMinutes%5 == 0 && currentMinutes > lastNotificationMinutes) {
            showNotificationBanner(currentMinutes);
            lastNotificationMinutes = currentMinutes;
        }
    }

    // Update timer every second
    let updateInterval = setInterval(updateDisplay, 1000);

    // Save data periodically (every 10 seconds) instead of every second
    let saveInterval = setInterval(updateTimerData, 10000);

    // Handle page visibility changes (tab switching)
    let wasVisible = !document.hidden;
    document.addEventListener('visibilitychange', function() {
        let isVisible = !document.hidden;

        if (isVisible && !wasVisible) {
            // Tab became visible - sync with storage and start new session
            updateTimerData(); // Save any pending time first
            timerData = initializeDomainTimer(); // Reload data and start new session
        } else if (!isVisible && wasVisible) {
            // Tab became hidden - save current session time
            updateTimerData();
        }

        wasVisible = isVisible;
    });

    // Handle page unload
    window.addEventListener("beforeunload", function() {
        updateTimerData();
        clearInterval(updateInterval);
        clearInterval(saveInterval);
    });

    // Handle page focus/blur (for cross-tab sync)
    window.addEventListener('focus', function() {
        // Refresh timer data when window gains focus
        updateTimerData(); // Save current session first
        timerData = initializeDomainTimer(); // Reload fresh data
    });

    window.addEventListener('blur', function() {
        updateTimerData();
    });

    // Initial display update
    updateDisplay();

    // Debug: Add console log for testing
    console.log(`Site timer initialized for ${domain}`);
    console.log('Document ready state:', document.readyState);
    console.log('Body exists:', !!document.body);

    // Monitor if the timer gets removed by the page and re-add if needed
    let checkInterval = setInterval(function() {
        if (!document.body.contains(box) && document.body) {
            console.log(`Timer was removed, re-adding for ${domain}`);
            document.body.appendChild(box);
        }
    }, 5000); // Check every 5 seconds

    // Clean up the monitoring when page unloads
    window.addEventListener("beforeunload", function() {
        clearInterval(checkInterval);
    });

})();
