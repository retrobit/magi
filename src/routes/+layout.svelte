<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>MAGI</title>
	<meta name="description" content="Three AI models. One consensus." />
</svelte:head>

{@render children()}
