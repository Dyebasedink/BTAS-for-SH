// ==UserScript==
// @name         BTAS
// @namespace    https://github.com/Dyebasedink/BTAS-for-SH
// @homepageURL  https://github.com/Dyebasedink/BTAS-for-SH
// @version      1.0.0
// @description  Blue Team Assistance Script for SH
// @author       Barry Y Yang; Jack SA Chen; Xingyu X Zhou
// @license      Apache-2.0
// @updateURL    https://greasyfork.org/scripts/463908-btas/code/BTAS.user.js
// @downloadURL  https://greasyfork.org/scripts/463908-btas/code/BTAS.user.js
// @match        https://www.pwcmanagedsecurityservices.cn/*
// @icon         https://www.google.com/s2/favicons?domain=pwchk.com
// @require      https://code.jquery.com/jquery-3.6.4.min.js
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

var $ = window.jQuery;

const LogSourceDomain = $('#customfield_10333-val').text().trim();
const LogSource = $('#customfield_10310-val').text().trim();
const rawLog = $('#field-customfield_10321 > div:first-child > div:nth-child(2)').text().trim().split('\n');

/**
 * This function creates and displays a flag using AJS.flag function
 * @param {string} type - The type of flag, can be one of the following: "success", "info", "warning", "error"
 * @param {string} title - The title of the flag
 * @param {string} body - The body of the flag
 * @param {string} close - The close of flag, can be one of the following: "auto", "manual", "never"
 */
function showFlag(type, title, body, close) {
    AJS.flag({
        type: type,
        title: title,
        body: body,
        close: close
    });
}

/**
 * This function registers a Tampermonkey search menu command
 * @param {Array} searchEngines - Search engines array containing the Jira, VT, AbuseIPDB
 */
function registerSearchMenu() {
    console.log('#### Code registerSearchMenu run ####');
    const searchEngines = [
        {
            name: 'Jira',
            url:
                'https://www.pwcmanagedsecurityservices.cn/issues/?jql=text%20~%20%22%s%22%20AND%20' +
                '%22Log%20Source%20Domain%22%20~%20%22%D%22%20' +
                'ORDER%20BY%20created%20DESC'
        },
        { name: 'VT', url: 'https://www.virustotal.com/gui/search/%s' },
        { name: 'AbuseIPDB', url: 'https://www.abuseipdb.com/check/%s' }
    ];
    searchEngines.forEach((engine) => {
        GM_registerMenuCommand(engine.name, () => {
            const selectedText = window.getSelection().toString();
            const searchURL = engine.url.replace('%s', selectedText).replace('%D', LogSourceDomain);
            if (selectedText.length === 0) {
                showFlag('error', 'No text selected', 'Please select some text and try again', 'auto');
            } else {
                window.open(searchURL, '_blank');
            }
        });
    });
}

/**
 * Creates a new button and adds it to the DOM.
 * @param {string} id - The ID attribute for the new button element.
 * @param {string} text - The text content to display on the new button.
 * @param {string} onClick - The function to call when the button is clicked.
 */
function addButton(id, text, onClick) {
    console.log(`#### Add Button: ${text}  ####`);
    const toolbar = $('.aui-toolbar2-primary');
    toolbar.append(`
        <div class="aui-buttons pluggable-ops">
        <a id="${id}" onclick="${onClick}" class="aui-button toolbar-trigger">
            <span class="trigger-label">${text}</span>
        </a>
        </div>
    `);
    $('#' + id).click(onClick);
}
/**
 * Creates three buttons on a JIRA issue page to handle Cortex XDR alerts
 * The buttons allow users to generate a description of the alerts, open the alert card page and timeline page
 */
function cortexAlertHandler() {
    console.log('#### Code cortexAlertHandler run ####');
    /**
     * Extracts the log information and organization name from the current JIRA issue page
     * @param {Object} orgDict - A dictionary that maps organization name to navigator name
     * @returns {Object} An object that contains the organization's name, organization's navigator URL, raw log information
     */
    const orgDict = {};
    function extractLog(orgDict) {
        const orgNavigator = orgDict[LogSourceDomain];
        return { LogSourceDomain, orgNavigator, rawLog };
    }
    //const { LogSourceDomain, orgNavigator, rawLog } = extractLog(orgDict);

    /**
     * Parse the relevant information from the raw log data
     * @param {Array} rawLog - An array of JSON strings representing the raw log data
     * @returns {Array} An array of objects containing the alert relevant information
     */
    function parseLog(rawLog) {
        const alertInfo = rawLog.reduce((acc, log) => {
            try {
                const { cortex_xdr } = JSON.parse(log);
                const { source, alert_id, name, description } = cortex_xdr;
                const isPANNGFW = source === 'PAN NGFW';
                const alert = { source, alert_id, name, description };
                if (isPANNGFW) {
                    const { action_local_ip, action_local_port, action_remote_ip, action_remote_port, action_pretty } =
                        cortex_xdr;
                    acc.push({
                        ...alert,
                        action_local_ip,
                        action_local_port,
                        action_remote_ip,
                        action_remote_port,
                        action_pretty
                    });
                } else {
                    const {
                        action_file_name,
                        action_file_path,
                        action_file_sha256,
                        actor_process_image_name,
                        actor_process_image_path,
                        actor_process_image_sha256,
                        host_name,
                        host_ip,
                        user_name,
                        actor_process_command_line
                    } = cortex_xdr;
                    const filename = action_file_name || actor_process_image_name;
                    const filepath = action_file_path || actor_process_image_path;
                    const sha256 = action_file_sha256 || actor_process_image_sha256;
                    acc.push({
                        ...alert,
                        host_name,
                        host_ip,
                        user_name,
                        actor_process_command_line,
                        filename,
                        filepath,
                        sha256
                    });
                }
            } catch (error) {
                console.error(`Error: ${error.message}`);
            }
            return acc;
        }, []);
        return alertInfo;
    }
    const alertInfo = parseLog(rawLog);

    /**
     * Define three functions for handling alert information:
     * generateDescription creates a description for each alert, and displays the combined description in an alert box
     * openCard opens a new window to display the alert card page for each alert
     * openTimeline opens a new window to display the timeline page for each alert
     */
    function generateDescription() {
        const alertDescriptions = [];
        for (const info of alertInfo) {
            const {
                source,
                name,
                action_local_ip,
                action_local_port,
                action_remote_ip,
                action_remote_port,
                action_pretty,
                host_name,
                host_ip,
                user_name,
                actor_process_command_line,
                filename,
                filepath,
                sha256,
                description
            } = info;
            if (source === 'PAN NGFW') {
                const desc = `Observed ${name}\nSrcip: ${action_local_ip}   Srcport: ${action_local_port}\nDstip: ${action_remote_ip}   Dstport: ${action_remote_port}\nAction: ${action_pretty}\n\nPlease help to verify if this activity is legitimate.\n`;
                alertDescriptions.push(desc);
            } else {
                const desc = `Observed ${
                    description || name
                }\nHost: ${host_name}   IP: ${host_ip}\nusername: ${user_name}\ncmd: ${actor_process_command_line}\nfilename: ${filename}\nfilepath:\n${filepath}\nhttps://www.virustotal.com/gui/file/${sha256}\n\nPlease help to verify if it is legitimate, if not please remove it and perform a full scan.\n`;
                alertDescriptions.push(desc);
            }
            const toolbarSha256 = $('.aui-toolbar2-inner');
            if (sha256 && !toolbarSha256.clone().children().remove().end().text().trim().includes(sha256)) {
                toolbarSha256.append(`${sha256} `);
            }
        }
        const alertMsg = [...new Set(alertDescriptions)].join('\n');
        alert(alertMsg);
    }
    function openCard() {
        for (const info of alertInfo) {
            const { source, alert_id } = info;
            if (orgNavigator) {
                let cardURL;
                switch (source) {
                    case 'XDR Analytics':
                        cardURL = `${orgNavigator}card/analytics2/${alert_id}`;
                        break;
                    case 'Correlation':
                        cardURL = `${orgNavigator}alerts/${alert_id}`;
                        break;
                    default:
                        cardURL = `${orgNavigator}card/alert/${alert_id}`;
                        break;
                }
                window.open(cardURL, '_blank');
            } else {
                showFlag('error', '', `There is no <strong>${LogSourceDomain}</strong> Navigator on Cortex`, 'auto');
            }
        }
    }
    function openTimeline() {
        for (const info of alertInfo) {
            const { source, alert_id } = info;
            if (orgNavigator) {
                let timelineURL;
                switch (source) {
                    case 'Correlation':
                        showFlag(
                            'error',
                            '',
                            `Source of the Alert is <strong>${source}</strong>, There is no Timeline on Cortex`,
                            'auto'
                        );
                        break;
                    default:
                        timelineURL = `${orgNavigator}forensic-timeline/alert_id/${alert_id}`;
                        break;
                }
                timelineURL && window.open(timelineURL, '_blank');
            } else {
                showFlag('error', '', `There is no <strong>${LogSourceDomain}</strong> Navigator on Cortex`, 'auto');
            }
        }
    }
    addButton('generateDescription', 'Description', generateDescription);
    addButton('openCard', 'Card', openCard);
    addButton('openTimeline', 'Timeline', openTimeline);
}

function MDEAlertHandler() {
    console.log('#### Code MDEAlertHandler run ####');

    function parseLog(rawLog) {
        const alertInfo = rawLog.reduce((acc, log) => {
            try {
                const formatJson = log.substring(log.indexOf('{')).trim();
                const logObj = JSON.parse(formatJson.replace(/\\\(n/g, '\\n('));
                const { mde } = logObj;
                const { title, id, computerDnsName, relatedUser, evidence } = mde;
                const alert = { title, id, computerDnsName };
                const userName = relatedUser ? relatedUser.userName : 'N/A';
                let extrainfo = '';
                if (evidence) {
                    const tmp = [];
                    for (const evidenceItem of evidence) {
                        if (evidenceItem.entityType === 'File') {
                            const description = `filename:${evidenceItem.fileName}\nfilePath:${evidenceItem.filePath}\nsha1:${evidenceItem.sha1}\n`;
                            tmp.push(description);
                        }
                        if (evidenceItem.entityType === 'Process') {
                            const description = `cmd:${evidenceItem.processCommandLine}\naccount:${evidenceItem.accountName}\nsha1:${evidenceItem.sha1}\n`;
                            tmp.push(description);
                        }
                    }
                    const uniqueDescriptions = Array.from(new Set(tmp));
                    extrainfo = uniqueDescriptions.join('\n');
                }
                acc.push({ ...alert, userName, extrainfo });
            } catch (error) {
                console.error(`Error: ${error.message}`);
            }
            return acc;
        }, []);
        return alertInfo;
    }
    const alertInfo = parseLog(rawLog);
    // console.info(`alertInfo: ${alertInfo}`);

    function generateDescription() {
        const alertDescriptions = [];
        for (const info of alertInfo) {
            const { title, computerDnsName, userName, extrainfo } = info;
            const desc = `Observed ${title}\nHost: ${computerDnsName}\nusername: ${userName}\n${extrainfo}\nPlease help to verify if it is legitimate.\n`;
            alertDescriptions.push(desc);
        }
        const alertMsg = [...new Set(alertDescriptions)].join('\n');
        alert(alertMsg);
    }
    function openMDE() {
        let MDEURL = '';
        for (const info of alertInfo) {
            const { id } = info;
            if (id) {
                MDEURL += `https://security.microsoft.com/alerts/${id}\n`;
            }
        }
        showFlag('info', 'MDE URL:', `${MDEURL}`, 'manual');
    }
    addButton('generateDescription', 'Description', generateDescription);
    addButton('openMDE', 'MDE', openMDE);
}

(function () {
    'use strict';

    registerSearchMenu();

    // Issue page: Alert Handler
    setInterval(() => {
        if ($('#issue-content').length && !$('#generateDescription').length) {
            console.log('#### Code Issue page: Alert Handler ####');
            const handlers = {
                'cortex_xdr': cortexAlertHandler,
                'Wazuh-MDE': MDEAlertHandler
            };
            const handler = handlers[LogSource];
            if (handler) {
                handler();
            }
        }
    }, 3000);
})();