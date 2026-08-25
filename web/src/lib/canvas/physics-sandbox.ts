import type { CanvasNodeData } from "@/types/canvas";

export type Vec2 = { x: number; y: number };

export type PhysicsConfig = {
    /** Downward acceleration in canvas px/s^2. */
    gravity: number;
    /** Bounciness on collisions and floor contact, 0..1. */
    restitution: number;
    /** Velocity retained per second (0..1); lower = more friction. */
    damping: number;
    /** If set, nodes rest above this world-y (acts as the ground). */
    floorY: number | null;
};

const DEFAULT_CONFIG: PhysicsConfig = {
    gravity: 900,
    restitution: 0.4,
    damping: 0.9,
    floorY: null,
};

type Body = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    pinned: boolean;
};

/**
 * Minimal Newtonian 2D sandbox for canvas nodes: gravity, AABB collision
 * resolution and an optional floor. Pure aside from the velocity store, so the
 * host drives it frame-by-frame with `step(nodes, dt, pinnedIds)`.
 */
export class NodePhysicsSim {
    private velocities = new Map<string, Vec2>();
    private config: PhysicsConfig;

    constructor(config?: Partial<PhysicsConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    setConfig(patch: Partial<PhysicsConfig>) {
        this.config = { ...this.config, ...patch };
    }

    reset() {
        this.velocities.clear();
    }

    /** Advance the simulation and return updated positions keyed by node id. */
    step(nodes: CanvasNodeData[], dt: number, pinnedIds: Set<string>): Map<string, Vec2> {
        const { gravity, restitution, damping, floorY } = this.config;
        const bodies: Body[] = nodes.map((node) => {
            const v = this.velocities.get(node.id) ?? { x: 0, y: 0 };
            return {
                id: node.id,
                x: node.position.x,
                y: node.position.y,
                w: node.width,
                h: node.height,
                vx: v.x,
                vy: v.y,
                pinned: pinnedIds.has(node.id),
            };
        });
        const result = new Map<string, Vec2>();

        // Integrate forces into dynamic bodies.
        const drag = Math.pow(damping, dt * 60);
        for (const body of bodies) {
            if (body.pinned) continue;
            body.vy += gravity * dt;
            body.vx *= drag;
            body.vy *= drag;
            body.x += body.vx * dt;
            body.y += body.vy * dt;
        }

        // Resolve collisions pairwise (a couple of passes settle stacks).
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < bodies.length; i++) {
                for (let j = i + 1; j < bodies.length; j++) {
                    resolveCollision(bodies[i], bodies[j], restitution);
                }
            }
        }

        // Floor contact (settle tiny bounces so resting nodes stop re-rendering).
        if (floorY != null) {
            for (const body of bodies) {
                if (body.pinned) continue;
                const bottom = body.y + body.h;
                if (bottom > floorY) {
                    body.y = floorY - body.h;
                    if (body.vy > 0) body.vy = -body.vy * restitution;
                    if (Math.abs(body.vy) < 30) body.vy = 0;
                }
            }
        }

        for (const body of bodies) {
            this.velocities.set(body.id, { x: body.vx, y: body.vy });
            result.set(body.id, { x: body.x, y: body.y });
        }
        return result;
    }
}

function resolveCollision(a: Body, b: Body, restitution: number) {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (overlapX <= 0 || overlapY <= 0) return;

    if (overlapX < overlapY) {
        const dir = a.x < b.x ? -1 : 1;
        const push = overlapX / 2;
        separate(a, b, dir * push, 0, restitution);
    } else {
        const dir = a.y < b.y ? -1 : 1;
        const push = overlapY / 2;
        separate(a, b, 0, dir * push, restitution);
    }
}

function separate(a: Body, b: Body, dx: number, dy: number, restitution: number) {
    if (!a.pinned && !b.pinned) {
        a.x += dx;
        a.y += dy;
        b.x -= dx;
        b.y -= dy;
    } else if (!a.pinned) {
        a.x += dx * 2;
        a.y += dy * 2;
    } else if (!b.pinned) {
        b.x -= dx * 2;
        b.y -= dy * 2;
    }

    if (dx !== 0) {
        const tmp = a.vx;
        a.vx = -b.vx * restitution;
        b.vx = -tmp * restitution;
    } else {
        const tmp = a.vy;
        a.vy = -b.vy * restitution;
        b.vy = -tmp * restitution;
    }
}
