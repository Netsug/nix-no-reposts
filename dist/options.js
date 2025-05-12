"use strict";
// options.ts - Handles the settings and their states
// Function to load the settings from storage
function loadSettings() {
    const debugMode = localStorage.getItem('debugMode') === 'true';
    const crosspostFilter = localStorage.getItem('crosspostFilter') === 'true';
    // Set checkbox states based on stored values
    document.getElementById('debugModeCheckbox').checked = debugMode;
    document.getElementById('crosspostCheckbox').checked = crosspostFilter;
}
// Function to toggle settings and save to localStorage
function toggleCheckbox(checkbox) {
    const settingName = checkbox.id;
    const settingValue = checkbox.checked;
    // Save the setting to localStorage
    localStorage.setItem(settingName, settingValue.toString());
}
// Event listener for document load to initialize settings
document.addEventListener('DOMContentLoaded', loadSettings);
