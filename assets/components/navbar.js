/**
 * Navbar web component for the Hidden Gems Leaderboard.
 * Usage: <hg-navbar active="daily|matrix|chart"></hg-navbar>
 */
class HgNavbar extends HTMLElement {
	static get observedAttributes() {
		return ['active'];
	}

	constructor() {
		super();
	}

	connectedCallback() {
		this.render();
	}

	attributeChangedCallback() {
		this.render();
	}

	render() {
		const active = this.getAttribute('active') || 'daily';

		const links = [
			{ id: 'daily', href: './index.html', label: 'Daily' },
			{ id: 'matrix', href: './matrix.html', label: 'Rank matrix' },
			{ id: 'chart', href: './chart.html', label: 'Rank chart' },
		];

		this.innerHTML = `
			<nav class="navbar navbar-expand-lg bg-body border-bottom">
				<div class="container">
					<a class="navbar-brand mb-0 h1 text-decoration-none" href="./index.html">Hidden Gems Leaderboard</a>
					<button
						class="navbar-toggler"
						type="button"
						data-bs-toggle="collapse"
						data-bs-target="#navLinks"
						aria-controls="navLinks"
						aria-expanded="false"
						aria-label="Toggle navigation"
					>
						<span class="navbar-toggler-icon"></span>
					</button>
					<div class="collapse navbar-collapse" id="navLinks">
						<ul class="navbar-nav ms-auto">
							${links.map(link => `
								<li class="nav-item">
									<a class="nav-link${link.id === active ? ' active' : ''}"${link.id === active ? ' aria-current="page"' : ''} href="${link.href}">${link.label}</a>
								</li>
							`).join('')}
						</ul>
					</div>
				</div>
			</nav>
		`;
	}
}

customElements.define('hg-navbar', HgNavbar);

export { HgNavbar };
