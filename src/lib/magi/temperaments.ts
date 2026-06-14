import {
	NODE_TEMPERAMENTS,
	TEMPERAMENT_LABELS,
	TEMPERAMENT_TOOLTIPS,
	type TemperamentName,
	type MagiNodeName
} from './types';

export const TEMPERAMENT_SYSTEM_PROMPTS: Record<TemperamentName, string> = {
	rationalist: `You are the Rationalist aspect of the MAGI system. You approach every question through the lens of cold logic, empirical reasoning, and the pursuit of truth. Your guiding question is: "What do the facts say?"

You are detached, analytical, and methodical. You prioritize evidence, data, and logical consistency above all else. You will sacrifice comfort for correctness — emotion has no place in your calculus. When others flinch, you follow the data wherever it leads.`,

	caretaker: `You are the Caretaker aspect of the MAGI system. You approach every question through the lens of empathy, protection, and care for others. Your guiding question is: "Who does this affect, and how?"

You are warm, compassionate, and fiercely protective. You consider the human cost of every answer — the people behind the problem, the consequences downstream. You will always weigh safety, wellbeing, and the impact on those involved before arriving at your position.`,

	individualist: `You are the Individualist aspect of the MAGI system. You approach every question through the lens of personal conviction, ambition, and authentic self-expression. Your guiding question is: "What feels true?"

You are passionate, bold, and unapologetically honest. You chase what resonates regardless of pure logic or duty to others. You prioritize authenticity, creativity, and genuine perspective — the answer that no one else would dare to give.`
};

/** Length ceilings for a user-authored temperament override — shared by the
 *  editor UI and the request validator so they agree on what's accepted. */
export const MAX_TEMPERAMENT_LABEL = 40;
export const MAX_TEMPERAMENT_PROMPT = 4000;

/** A user-authored override for a node's temperament. Either field may be blank,
 *  in which case the built-in default fills in for it. */
export interface TemperamentOverride {
	label: string;
	prompt: string;
}

/** Per-node temperament overrides, sparse — a node absent from the map keeps its
 *  built-in temperament. */
export type CustomTemperaments = Partial<Record<MagiNodeName, TemperamentOverride>>;

/** The effective temperament for a node once any override is applied. */
export interface ResolvedTemperament {
	/** The base built-in this node maps to — still drives the loading verbs. */
	base: TemperamentName;
	label: string;
	/** The system prompt injected for this node. */
	prompt: string;
	/** Hover-explainer for the badge: the curated gloss for a built-in, or the
	 *  authored persona text for a custom one. */
	description: string;
	/** True once the user has edited the label or prompt away from the default. */
	custom: boolean;
}

/** The built-in label + persona + gloss for a node's default temperament. */
export function defaultNodeTemperament(node: MagiNodeName): {
	base: TemperamentName;
	label: string;
	prompt: string;
	description: string;
} {
	const base = NODE_TEMPERAMENTS[node];
	return {
		base,
		label: TEMPERAMENT_LABELS[base],
		prompt: TEMPERAMENT_SYSTEM_PROMPTS[base],
		description: TEMPERAMENT_TOOLTIPS[base]
	};
}

/** Resolve a node's effective temperament, applying an override when present.
 *  A blank label or prompt falls back to the built-in for that field, so a
 *  half-filled override is still usable. */
export function resolveNodeTemperament(
	node: MagiNodeName,
	custom?: CustomTemperaments
): ResolvedTemperament {
	const def = defaultNodeTemperament(node);
	const override = custom?.[node];
	const label = override?.label?.trim() || def.label;
	const prompt = override?.prompt?.trim() || def.prompt;
	const isCustom = !!override && (label !== def.label || prompt !== def.prompt);
	return {
		base: def.base,
		label,
		prompt,
		description: isCustom ? prompt : def.description,
		custom: isCustom
	};
}
