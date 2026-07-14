<script lang="ts">
	import './layout.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';

	// Vercel Web Analytics (page views / referrers). First-party script + beacon
	// (/_vercel/insights/*), so the strict same-origin CSP already permits it;
	// no-ops in dev and on hosts without the dashboard feature enabled.
	injectAnalytics();

	let { children } = $props();
</script>

<!-- Title/description/OG metadata live in app.html: with ssr=false a
     <svelte:head> only renders in the browser, which link-preview crawlers
     never execute — and at runtime it would only duplicate the static tags. -->
{@render children()}
