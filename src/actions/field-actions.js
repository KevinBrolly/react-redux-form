import _get from '../utils/get';
import mapValues from '../utils/map-values';

import actionTypes from '../action-types';
import batch from './batch-actions';
import getValidity from '../utils/get-validity';
import isValidityValid from '../utils/is-validity-valid';
import isValidityInvalid from '../utils/is-validity-invalid';
import invertValidity from '../utils/invert-validity';
import { trackable } from '../utils/track';
import getForm from '../utils/get-form';
import getFieldFromState from '../utils/get-field-from-state';
import isValid from '../form/is-valid';
import NULL_ACTION from '../constants/null-action';
import omit from 'lodash/omit';

const defaultStrategies = {
  get: _get,
};

function createFieldActions(s = defaultStrategies) {
  const focus = (model) => ({
    type: actionTypes.FOCUS,
    model,
  });

  const blur = (model) => ({
    type: actionTypes.BLUR,
    model,
  });

  const setPristine = (model) => ({
    type: actionTypes.SET_PRISTINE,
    model,
  });

  const setDirty = (model) => ({
    type: actionTypes.SET_DIRTY,
    model,
  });

  const setInitial = (model) => ({
    type: actionTypes.SET_INITIAL,
    model,
  });

  const setPending = (model, pending = true) => ({
    type: actionTypes.SET_PENDING,
    model,
    pending,
  });

  const setValidating = (model, validating = true) => ({
    type: actionTypes.SET_VALIDATING,
    model,
    validating,
  });

  const setValidity = (model, validity, options = {}) => ({
    type: options.errors
      ? actionTypes.SET_ERRORS
      : actionTypes.SET_VALIDITY,
    model,
    [options.errors ? 'errors' : 'validity']: validity,
  });

  const resetValidity = (model, omitKeys = false) => {
    if (!omitKeys) {
      return {
        type: actionTypes.RESET_VALIDITY,
        model,
      };
    }

    return (dispatch, getState) => {
      const field = getFieldFromState(getState(), model);

      if (!field) {
        dispatch(NULL_ACTION);
      } else {
        dispatch({
          type: actionTypes.SET_VALIDITY,
          model,
          validity: omit(field.validity, omitKeys),
        });
      }
    };
  };

  const setFieldsValidity = (model, fieldsValidity, options = {}) => ({
    type: actionTypes.SET_FIELDS_VALIDITY,
    model,
    fieldsValidity,
    options,
  });

  const setErrors = (model, errors, options = {}) =>
    setValidity(model, errors, {
      ...options,
      errors: true,
    });

  const setFieldsErrors = (model, fieldsErrors, options) =>
    setFieldsValidity(model, fieldsErrors, {
      ...options,
      errors: true,
    });

  const resetErrors = resetValidity;

  const setTouched = (model) => ({
    type: actionTypes.SET_TOUCHED,
    model,
  });

  const setUntouched = (model) => ({
    type: actionTypes.SET_UNTOUCHED,
    model,
  });

  const asyncSetValidity = (model, validator) => (dispatch, getState) => {
    const value = s.get(getState(), model);

    dispatch(setValidating(model, true));

    const done = (validity) => {
      dispatch(setValidity(model, validity));
    };

    const immediateResult = validator(value, done);

    if (typeof immediateResult !== 'undefined') {
      done(immediateResult);
    }
  };

  const setSubmitted = (model, submitted = true) => ({
    type: actionTypes.SET_SUBMITTED,
    model,
    submitted,
  });

  const setSubmitFailed = (model, submitFailed = true) => ({
    type: actionTypes.SET_SUBMIT_FAILED,
    model,
    submitFailed,
  });

  const submit = (model, promise, options = {}) => (dispatch, getState) => {
    if (options.validate) {
      const form = getForm(getState(), model);

      if (!form.$form.valid) {
        return dispatch(NULL_ACTION);
      }

      dispatch(setPending(model, true));
    } else if (options.validators || options.errors) {
      const validators = options.validators || options.errors;
      const isErrors = options.errors;
      const value = s.get(getState(), model);
      const validity = getValidity(validators, value);
      const valid = options.errors
        ? !isValidityInvalid(validity)
        : isValidityValid(validity);

      if (!valid) {
        return dispatch(isErrors
          ? setErrors(model, validity)
          : setValidity(model, validity));
      }

      dispatch(batch(model, [
        setValidity(model, isErrors
          ? invertValidity(validity)
          : validity),
        setPending(model, true),
      ]));
    } else {
      dispatch(setPending(model, true));
    }

    const errorsAction = options.fields
      ? setFieldsErrors
      : setErrors;

    promise.then(response => {
      dispatch(batch(model, [
        setSubmitted(model, true),
        setValidity(model, response),
      ]));
    }).catch(error => {
      console.error(error);
      dispatch(batch(model, [
        setSubmitFailed(model),
        errorsAction(model, error),
      ]));
    });

    return promise;
  };

  const submitFields = (model, promise, options = {}) =>
    submit(model, promise, {
      ...options,
      fields: true,
    });

  const validSubmit = (model, promise, options = {}) =>
    submit(model, promise, {
      ...options,
      validate: true,
    });

  const validate = (model, validators) => (dispatch, getState) => {
    const value = s.get(getState(), model);
    const validity = getValidity(validators, value);

    dispatch(setValidity(model, validity));
  };

  const validateErrors = (model, errorValidators) => (dispatch, getState) => {
    const value = s.get(getState(), model);
    const errors = getValidity(errorValidators, value);

    dispatch(setValidity(model, errors, { errors: true }));
  };

  function isFormValidWithoutFields(form, fieldsValidity) {
    if (Object.keys(form.$form.validity).length
      && !isValidityValid(form.$form.validity)) {
      return false;
    }

    // TODO: map through form keys without $form
    const valid = Object.keys(form)
      .every((fieldKey) => {
        if (fieldKey === '$form') return true;

        if (fieldsValidity.hasOwnProperty(fieldKey)) {
          return true;
        }

        return isValid(form[fieldKey]);
      });

    return valid;
  }

  const validateFields =
    (model, fieldValidators, options = {}) => (dispatch, getState) => {
      const value = s.get(getState(), model);

      const fieldsValidity = mapValues(fieldValidators, (validator, field) => {
        const fieldValue = field
          ? s.get(value, field)
          : value;

        const fieldValidity = getValidity(validator, fieldValue);

        return fieldValidity;
      });

      const validCB = options.onValid;
      const invalidCB = options.onInvalid;

      if (validCB || invalidCB) {
        const form = getForm(getState(), model);
        const formValid = (form && !fieldsValidity.hasOwnProperty(''))
          ? isFormValidWithoutFields(form, fieldsValidity)
          : true;

        const fieldsValid = options.errors
          ? !isValidityInvalid(fieldsValidity)
          : isValidityValid(fieldsValidity);

        if (validCB && formValid && fieldsValid) {
          validCB();
        } else if (invalidCB) {
          invalidCB();
        }
      }

      const fieldsValiditySetter = options.errors
        ? setFieldsErrors
        : setFieldsValidity;

      dispatch(fieldsValiditySetter(model, fieldsValidity));
    };

  const validateFieldsErrors = (model, fieldErrorsValidators, options = {}) =>
    validateFields(model, fieldErrorsValidators, {
      ...options,
      errors: true,
    });

  return mapValues({
    blur,
    focus,
    submit,
    submitFields,
    validSubmit,
    setDirty,
    setErrors,
    setInitial,
    setPending,
    setValidating,
    setPristine,
    setSubmitted,
    setSubmitFailed,
    setTouched,
    setUntouched,
    setValidity,
    setFieldsValidity,
    setFieldsErrors,
    resetValidity,
    resetErrors,
    validate,
    validateErrors,
    validateFields,
    validateFieldsErrors,
    asyncSetValidity,
  }, trackable);
}

export {
  createFieldActions,
};
export default createFieldActions();
