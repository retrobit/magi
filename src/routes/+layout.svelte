<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<!-- Title/description/OG metadata live in app.html: with ssr=false a
     <svelte:head> only renders in the browser, which link-preview crawlers
     never execute — and at runtime it would only duplicate the static tags. -->
{@render children()}
