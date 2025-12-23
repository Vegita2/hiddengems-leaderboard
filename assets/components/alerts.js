import { setVisible } from '../utils.js';

/**
 * Alerts container web component for the Hidden Gems Leaderboard.
 * Provides serve hint and error display functionality.
 * Usage: <hg-alerts page="index|chart|matrix"></hg-alerts>
 */
class HgAlerts extends HTMLElement {
	constructor() {
		super();
		this._serveHint = null;
		this._loadError = null;
	}

	connectedCallback() {
		const page = this.getAttribute('page') || 'index';

		this.innerHTML = `
			<div class="alert alert-info d-none" id="serveHint" role="alert">
				To load <code>data.json</code>, serve this folder (e.g. <code>python -m http.server</code>) instead of opening
				<code>${page}.html</code> via <code>file://</code>.
			</div>
			<div class="alert alert-danger d-none" id="loadError" role="alert"></div>
		`;

		this._serveHint = this.querySelector('#serveHint');
		this._loadError = this.querySelector('#loadError');
	}

	get serveHint() {
		return this._serveHint;
	}

	get loadError() {
		return this._loadError;
	}

	showError(message) {
		if (this._loadError) {
			this._loadError.textContent = message;
			setVisible(this._loadError, true);
		}
	}

	showServeHint() {
		if (this._serveHint) {
			setVisible(this._serveHint, true);
		}
	}
}

customElements.define('hg-alerts', HgAlerts);

export { HgAlerts };
