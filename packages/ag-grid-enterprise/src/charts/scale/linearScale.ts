import { Deinterpolator, Reinterpolator } from "./scale";
import ContinuousScale from "./continuousScale";
import { ascending } from "../util/compare";
import ticks, { tickIncrement } from "../util/ticks";

// export class LinearScaleNew<R> extends ContinuousScale<R> {
//
//     ticks(count = 10) {
//         const d = this._domain;
//         return ticks(d[0], d[d.length - 1], count);
//     }
//
//     /**
//      * Extends the domain so that it starts and ends on nice round values.
//      * @param count Tick count.
//      */
//     nice(count = 10) {
//         const d = this.domain;
//         let i0 = 0;
//         let i1 = d.length - 1;
//         let start = d[i0];
//         let stop = d[i1];
//         let step;
//
//         if (stop < start) {
//             step = start;
//             start = stop;
//             stop = step;
//
//             step = i0;
//             i0 = i1;
//             i1 = step;
//         }
//
//         step = tickIncrement(start, stop, count);
//
//         if (step > 0) {
//             start = Math.floor(start / step) * step;
//             stop = Math.ceil(stop / step) * step;
//             step = tickIncrement(start, stop, count);
//         } else if (step < 0) {
//             start = Math.ceil(start * step) / step;
//             stop = Math.floor(stop * step) / step;
//             step = tickIncrement(start, stop, count);
//         }
//
//         if (step > 0) {
//             d[i0] = Math.floor(start / step) * step;
//             d[i1] = Math.ceil(stop / step) * step;
//             this.domain = d;
//         } else if (step < 0) {
//             d[i0] = Math.ceil(start * step) / step;
//             d[i1] = Math.floor(stop * step) / step;
//             this.domain = d;
//         }
//     }
// }

/**
 * Maps continuous domain to a continuous range.
 */
export class LinearScale<R> extends ContinuousScale<R> {
    protected deinterpolatorOf(a: number, b: number): Deinterpolator<number> {
        const d = b - a;
        if (d === 0 || isNaN(d)) {
            return () => d;
        } else {
            return x => (x - a) / d;
        }
    }

    protected reinterpolatorOf(a: number, b: number): Reinterpolator<number> {
        const d = b - a;
        return t => a + d * t;
    }

    ticks(count = 10) {
        const d = this._domain;
        return ticks(d[0], d[d.length - 1], count);
    }

    /**
     * Extends the domain so that it starts and ends on nice round values.
     * @param count Tick count.
     */
    nice(count = 10) {
        const d = this.domain;
        let i0 = 0;
        let i1 = d.length - 1;
        let start = d[i0];
        let stop = d[i1];
        let step;

        if (stop < start) {
            step = start;
            start = stop;
            stop = step;

            step = i0;
            i0 = i1;
            i1 = step;
        }

        step = tickIncrement(start, stop, count);

        if (step > 0) {
            start = Math.floor(start / step) * step;
            stop = Math.ceil(stop / step) * step;
            step = tickIncrement(start, stop, count);
        } else if (step < 0) {
            start = Math.ceil(start * step) / step;
            stop = Math.floor(stop * step) / step;
            step = tickIncrement(start, stop, count);
        }

        if (step > 0) {
            d[i0] = Math.floor(start / step) * step;
            d[i1] = Math.ceil(stop / step) * step;
            this.domain = d;
        } else if (step < 0) {
            d[i0] = Math.ceil(start * step) / step;
            d[i1] = Math.floor(stop * step) / step;
            this.domain = d;
        }
    }
}

/**
 * Returns a function of parameter `t` that interpolates between `a` and `b`.
 * If the `t` is outside `[0, 1]`, the returned value is not guaranteed to be inside `[a, b]`.
 * @param a
 * @param b
 */
export function numberReinterpolatorFactory(a: number, b: number): Reinterpolator<number> {
    const d = b - a;
    return t => a + d * t;
}

/**
 * Returns a function that returns the value of `t` for a given `x` inside `[a, b]`.
 * If the `x` is outside `[a, b]`, the `t` is not guaranteed to be inside `[0, 1]`.
 * @param a
 * @param b
 */
export function numberDeinterpolatorFactory(a: number, b: number): Deinterpolator<number> {
    const d = b - a;
    if (d === 0 || isNaN(d)) {
        return () => d;
    } else {
        return x => (x - a) / d;
    }
}

// protected deinterpolatorOf(a: number, b: number): Deinterpolator<number> {
//     const d = b - a;
//     if (d === 0 || isNaN(d)) {
//         return () => d;
//     } else {
//         return x => (x - a) / d;
//     }
// }

/**
 * Creates a continuous scale with the default interpolator and no clamping.
 */
export default function scaleLinear() {
    // const scale = new LinearScale<number>(numberReinterpolatorFactory, numberDeinterpolatorFactory, ascending);
    const scale = new LinearScale<number>(numberReinterpolatorFactory, numberDeinterpolatorFactory, ascending);
    scale.range = [0, 1];
    return scale;
}
