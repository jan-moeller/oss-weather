import { lc } from '@nativescript-community/l';
import { confirm, alert as mdAlert } from '@nativescript-community/ui-material-dialogs';
import { showSnack } from '@nativescript-community/ui-material-snackbar';
import { BaseError } from 'make-error';
import { l } from '~/helpers/locale';
import { NoNetworkError } from '~/services/api';

function evalTemplateString(resource: string, obj: {}) {
    if (!obj) {
        return resource;
    }
    const names = Object.keys(obj);
    const vals = Object.keys(obj).map((key) => obj[key]);
    return new Function(...names, `return \`${resource}\`;`)(...vals);
}

export class CustomError extends BaseError {
    customErrorConstructorName: string;
    isCustomError = true;
    assignedLocalData: any;
    silent?: boolean;
    constructor(props?, customErrorConstructorName?: string) {
        super(props.message);
        this.message = props.message;
        delete props.message;

        this.silent = props.silent;
        delete props.silent;

        // we need to understand if we are duplicating or not
        const isError = props instanceof Error;
        if (customErrorConstructorName || isError) {
            // duplicating
            // use getOwnPropertyNames to get hidden Error props
            const keys = Object.getOwnPropertyNames(props);
            for (let index = 0; index < keys.length; index++) {
                const k = keys[index];
                if (!props[k] || typeof props[k] === 'function') continue;
                this[k] = props[k];
            }
        } else {
            this.assignedLocalData = props;
        }

        if (!this.customErrorConstructorName) {
            this.customErrorConstructorName = customErrorConstructorName || (this as any).constructor.name; // OR (<any>this).constructor.name;
        }
    }

    localData() {
        const res = {};
        for (const key in this.assignedLocalData) {
            res[key] = this.assignedLocalData[key];
        }
        return res;
    }

    toJSON() {
        const error = {
            message: this.message
        };
        Object.getOwnPropertyNames(this).forEach((key) => {
            if (typeof this[key] !== 'function') {
                error[key] = this[key];
            }
        });
        return error;
    }
    toData() {
        return JSON.stringify(this.toJSON());
    }
    toString() {
        const result = evalTemplateString(l(this.message), Object.assign({ l }, this.assignedLocalData));
        return result;
    }

    getMessage() {}
}

export async function showError(err: Error | string) {
    if (!err) {
        return;
    }

    if (err['customErrorConstructorName'] === 'NoNetworkError') {
        showSnack({ message: l('no_network') });
        return;
    }
    const realError = typeof err === 'string' ? null : err;
    const isString = realError === null;
    const message = isString ? (err as string) : realError.message || realError.toString();
    const title = lc('error');
    // const reporterEnabled = isSentryEnabled;
    const reporterEnabled = false;
    let showSendBugReport = reporterEnabled && !isString && !!realError.stack;
    if (realError instanceof NoNetworkError) {
        showSendBugReport = false;
    }
    console.error('showError', message, err, err['stack']);
    const result = await confirm({
        title,
        okButtonText: showSendBugReport ? lc('send_bug_report') : undefined,
        cancelButtonText: showSendBugReport ? lc('cancel') : lc('ok'),
        message
    });
    // if (result && isSentryEnabled) {
    //     Sentry.captureException(err);
    //     this.$alert(l('bug_report_sent'));
    // }
}

export function alert(message: string) {
    return mdAlert({
        okButtonText: l('ok'),
        message
    });
}
