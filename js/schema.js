import { SchemaType } from "@google/generative-ai";

// Character schema
export const CharacterSchema = {
    type: SchemaType.OBJECT,
    properties: {
        name: { type: SchemaType.STRING, description: "name of character", nullable: false },
        age: { type: SchemaType.NUMBER, description: "age of character", nullable: true },
        gender: { type: SchemaType.STRING, description: "gender of character", nullable: true },
        personality: { 
            type: SchemaType.ARRAY, 
            description: "list of personality traits",
            items: { type: SchemaType.STRING, description: "personality trait" },
            nullable: true 
        },
        occupation: { type: SchemaType.STRING, description: "occupation of character", nullable: true },
        customElements: { type: SchemaType.STRING, description: "custom elements", nullable: true }
    }
};

// Story configuration schema
export const StoryConfigSchema = {
    type: SchemaType.OBJECT,
    properties: {
        theme: { type: SchemaType.STRING, description: "story theme", nullable: false },
        focus: { type: SchemaType.STRING, description: "story focus", nullable: false },
        setting: { type: SchemaType.STRING, description: "story setting", nullable: false },
        time_period: { type: SchemaType.STRING, description: "time period", nullable: false },
        pov: { type: SchemaType.STRING, description: "point of view", nullable: false },
        trope: { type: SchemaType.STRING, description: "story trope", nullable: false },
        genre: { type: SchemaType.STRING, description: "story genre", nullable: false },
        details: { type: SchemaType.STRING, description: "additional details", nullable: true },
        length: { type: SchemaType.NUMBER, description: "story length", nullable: false }
    }
};

// Story input schema
export const StoryInputSchema = {
    type: SchemaType.OBJECT,
    properties: {
        prompt: { type: SchemaType.STRING, description: "story prompt", nullable: false }
    }
};

// Character name request schema
export const CharacterNameRequestSchema = {
    type: SchemaType.OBJECT,
    properties: {
        name: { type: SchemaType.STRING, description: "character name", nullable: false }
    }
};

// Character response schema
export const CharacterResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        name: { type: SchemaType.STRING, description: "name of character", nullable: false },
        age: { type: SchemaType.NUMBER, description: "integer age of character", nullable: false },
        personality: { 
            type: SchemaType.ARRAY, 
            description: "list of personality traits of character",
            items: { type: SchemaType.STRING, description: "personality trait, format should be 1 word 1 emoji" }
        },
        occupation: { type: SchemaType.STRING, description: "character's job", nullable: false},
        gender: { type: SchemaType.STRING, description: "Male, Female, Non Binary", nullable: false }
    },
        required: ["name", "age", "personality", "occupation", "gender"]
};

// Story choices schema
export const StoryChoicesSchema = {
    type: SchemaType.OBJECT,
    properties: {
        text: { type: SchemaType.STRING, description: "choice text", nullable: false },
        impact: { type: SchemaType.STRING, description: "choice impact", nullable: false },
        tension_level: { type: SchemaType.NUMBER, description: "tension level", nullable: false }
    }
};

// Story image schema
export const StoryImageSchema = {
    type: SchemaType.OBJECT,
    properties: {
        url: { type: SchemaType.STRING, description: "image URL", nullable: false },
        description: { type: SchemaType.STRING, description: "image description", nullable: false }
    }
};

// Story state schema
export const StoryStateSchema = {
    type: SchemaType.OBJECT,
    properties: {
        location: { type: SchemaType.STRING, description: "current location", nullable: false },
        new_location: { type: SchemaType.BOOLEAN, description: "indicates new location", nullable: false },
        location_description: { type: SchemaType.STRING, description: "location description", nullable: false },
        active_plot_threads: { 
            type: SchemaType.ARRAY, 
            description: "active plot threads",
            items: { type: SchemaType.STRING, description: "plot thread" }
        },
        unresolved_elements: { 
            type: SchemaType.ARRAY, 
            description: "unresolved story elements",
            items: { type: SchemaType.STRING, description: "unresolved element" }
        },
        story_phase: { type: SchemaType.STRING, description: "current story phase", nullable: false },
        emotional_tone: { type: SchemaType.STRING, description: "current emotional tone", nullable: false },
        current_tension: { type: SchemaType.NUMBER, description: "current tension level", nullable: false }
    }
};

// Story response schema
export const StoryResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        text: { type: SchemaType.STRING, description: "story text", nullable: false },
        choices: { 
            type: SchemaType.ARRAY, 
            description: "available choices",
            items: StoryChoicesSchema  // Direct reference to schema
        },
        current_tension: { type: SchemaType.NUMBER, description: "current tension level", nullable: false },
        story_state: StoryStateSchema,  // Direct reference to schema
        story_images: { 
            type: SchemaType.ARRAY, 
            description: "story images",
            items: StoryImageSchema  // Direct reference to schema
        },
        story_over: { type: SchemaType.BOOLEAN, description: "indicates if story is over", nullable: false }
    }
};