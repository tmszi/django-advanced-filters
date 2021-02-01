import logging

from django.apps import apps
from django.conf import settings
from django.contrib.admin.utils import get_fields_from_path
from django.db import models
from django.core.exceptions import FieldDoesNotExist
from django.utils.encoding import force_str
from django.views.generic import View

from braces.views import (CsrfExemptMixin, StaffuserRequiredMixin,
                          JSONResponseMixin)


logger = logging.getLogger('advanced_filters.views')


class GetFieldChoices(CsrfExemptMixin, StaffuserRequiredMixin,
                      JSONResponseMixin, View):
    """
    A JSONResponse view that accepts a model and a field (path to field),
    resolves and returns the valid choices for that field.
    Model must use the "app.Model" notation.

    If this field is not a simple Integer/CharField with predefined choices,
    all distinct entries in the DB are presented, unless field name is in
    ADVANCED_FILTERS_DISABLE_FOR_FIELDS and limited to display only results
    under ADVANCED_FILTERS_MAX_CHOICES.
    """
    def get(self, request, model=None, field_name=None, app_label=None):
        if model is field_name is app_label is None:
            return self.render_json_response(
                {'error': "GetFieldChoices view requires 3 arguments"},
                status=400)
        model_app_label, model_name = model.split('.', 1)
        annotated_field = None
        choices = None
        try:
            model_obj = apps.get_model(model_app_label, model_name)
            field = get_fields_from_path(model_obj, field_name)[-1]
            model_obj = field.model  # use new model if followed a ForeignKey
            choices = field.choices
        except AttributeError as e:
            logger.debug("Invalid kwargs passed to view: %s", e)
            return self.render_json_response(
                {'error': "No installed app/model: %s" % model}, status=400)
        except (LookupError, FieldDoesNotExist) as e:
            app = apps.get_app_config(app_label)
            for f in getattr(app.module.filters, 'AF_FILTERS'):
                if (f.field == field_name and
                    f.model._meta.model_name == model_name):
                    break
            field = f()
            field.name = field.field
            annotated_field = True
            try:
                if request.user.has_perm('can_edit_all_units'):
                    administrative_unit = request.user.administrated_units.all()
                else:
                    administrative_unit = request.user.administrated_units.first()
            except Exception as e:
                logger.debug("Invalid kwargs passed to view: %s", e)
                return self.render_json_response(
                    {'error': force_str(e)}, status=400)

        # if no choices, populate with distinct values from instances
        if not choices:
            choices = []
            disabled = getattr(settings, 'ADVANCED_FILTERS_DISABLE_FOR_FIELDS',
                               tuple())
            max_choices = getattr(settings, 'ADVANCED_FILTERS_MAX_CHOICES', 254)
            if field and field.name in disabled:
                logger.debug('Skipped lookup of choices for disabled fields')
            elif field and isinstance(field, (models.BooleanField, models.DateField,
                                              models.TimeField)):
                logger.debug('No choices calculated for field %s of type %s',
                             field, type(field))
            else:
                if field:
                    if annotated_field:
                        choices = field.queryset(
                            administrative_unit=administrative_unit,
                        ).order_by(field.name).values_list(
                            field.name, flat=True).distinct()
                    else:
                        # the order_by() avoids ambiguity with values() and distinct()
                        choices = model_obj.objects.order_by(field.name).values_list(
                            field.name, flat=True).distinct()
                    # additional query is ok to avoid fetching too many values
                    if choices:
                        if choices.count() <= max_choices:
                            choices = zip(choices, choices)
                            logger.debug('Choices found for field %s: %s',
                                         field.name, choices)
                    else:
                        choices = []

        results = [{'id': c[0], 'text': force_str(c[1])} for c in sorted(
                   choices, key=lambda x: (x[0] is not None, x[0]))]

        return self.render_json_response({'results': results})
