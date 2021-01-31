var _af_handlers = window._af_handlers || null;
var OperatorHandlers = function($) {
	var self = this;
	self.value = null;
	self.val_input = null;
	self.selected_field_elm = null;

	self.add_datepickers = function() {
		var form_id = self.val_input.parents('tr').attr('id');
		var form_num = parseInt(form_id.replace('form-', ''), 10);

		if ($("#id_form-" + form_num + "-value_from").length > 0) { return };
		var $from = $('<input type="text">');
		$from.attr("name", "form-" + form_num + "-value_from");
		$from.attr("id", "id_form-" + form_num + "-value_from");
		$from.attr("placeholder", gettext('Start date (YYYY-MM-DD HH-MM)'));
		$from.addClass('query-dt-from');
		var $to = $('<input type="text">');
		$to.attr("name", "form-" + form_num + "-value_to");
		$to.attr("id", "id_form-" + form_num + "-value_to");
		$to.attr("placeholder", gettext('End date (YYYY-MM-DD HH-MM)'));
		$to.addClass('query-dt-to');

		self.val_input.parent().prepend($to);
		self.val_input.parent().prepend($from);
		var val = self.val_input.val();
		if (!val || val == 'null') {
			self.val_input.val("-");
		} else {
			from_to = val.split(',');
			if (from_to.length == 2) {
				$from.val(from_to[0])
				$to.val(from_to[1])
			}
		}
		self.val_input.css({display: 'none'});
		$(".hasDatepicker").datetimepicker("destroy");
		$from.addClass('vDateTimeField');
		$to.addClass('vDateTimeField');
		/* 
			init jQuery-ui datetime picker
			https://github.com/trentrichardson/jQuery-Timepicker-Addon
		*/
		$(".query-dt-from, .query-dt-to").datetimepicker({
			dateFormat: 'yy-mm-dd'
		});
	};

	self.initialize_select2 = function(elm) {
		// initialize select2 widget and populate field choices
		var field = $(elm).val();
		var other_models_fields = JSON.parse(OTHER_MODELS_FIELDS);
		var other_model = other_models_fields[field];
		if (typeof other_model !== 'undefined') {
			var choices_url = ADVANCED_FILTER_CHOICES_LOOKUP_URL +
				other_model + '/' + field.split('.')[1] + '/' + APP_LABEL;
		} else {
			var choices_url = ADVANCED_FILTER_CHOICES_LOOKUP_URL +
				(FORM_MODEL || MODEL_LABEL) + '/' + field + '/' + APP_LABEL;
		}
		var input = $(elm).parents('tr').find('input.query-value');
		input.select2("destroy");
		$.get(choices_url, function(data) {
			input.select2({'data': data, 'createSearchChoice': function(term) {
			return { 'id': term, 'text': term };
			}});
		});
	};

	self.remove_datepickers = function() {
		self.val_input.css({display: 'block'});
		if (self.val_input.parent().find('input.vDateTimeField').length > 0) {
			var datefields = self.val_input.parent().find('input.vDateTimeField');
			datefields.each(function() {
				$(this).datetimepicker("destroy");
			});
			datefields.remove();
		}
	};

	self.load_field_operators = function(op, field) {
		// pick a widget for the value field according field_operators to operator
		if (field.val() == '_OR') {
			op.prop('disabled', true);
			var value = field.parents('tr').find('.query-value');
			value.prop('disabled', true);
		}
		var operators = JSON.parse(FILTER_FIELDS_OPERATORS);
		var field_operators = operators[field.val()];
		if (typeof field_operators !== 'undefined') {
			op.empty();
			var value;
			$.each(field_operators, function (index, operator) {
				if (index == 0) value = operator[0];
				op.append($('<option></option>').attr('value', operator[0]).text(operator[1]));
			})
			op.val(value).change();
		}
	};

	self.modify_widget = function(elm) {
		// pick a widget for the value field according to operator
		self.value = $(elm).val();
		self.val_input = $(elm).parents('tr').find('.query-value');
		var field =  $(elm).parents('tr').find('.query-field');
		if (self.value == "range") {
			self.add_datepickers();
		} else {
			self.remove_datepickers();
		}
		if ($.inArray(self.value, ['isnull', 'istrue', 'isfalse']) >= 0) {
			self.val_input.select2('destroy');
			self.val_input.val('null');
			self.val_input.prop('disabled', true);
		} else {
			if (self.value != 'range' && !(self.val_input.data('select2')) && field.val() != '_OR') {
				self.val_input.prop('disabled', false);
				self.initialize_select2($(elm).parents('tr').find('.query-field'));
			} else if (self.value != 'range') {
				self.val_input.select2('destroy');
			}
		}
	};

	self.field_selected = function(elm) {
		self.selected_field_elm = elm;
		var row = $(elm).parents('tr');
		var op = row.find('.query-operator');
		var value = row.find('.query-value');
		if ($(elm).val() == "_OR") {
			op.empty()
			var operators = JSON.parse(ALL_QUERY_OPERATORS);
			op.append($('<option></option>').attr('value', operators[0][0]).text(operators[0][1]));
			op.val("iexact").prop("disabled", true);
			value.val("null").prop("disabled", true);
			value.each(function() {
				var id = $(this).attr('id');
				$('#' + id + '_from, #' + id + '_to').each(function() {
					$(this).remove()
				});
			});
			value.select2("destroy");
			op.after('<input type="hidden" value="' + op.val() +
				'" name="' + op.attr("name") + '">');
			value.after('<input type="hidden" value="' + value.val() +
				'" name="' + value.attr("name") + '">');
		} else {
			op.prop("disabled", false);
			op.siblings('input[type="hidden"]').remove();
			value.prop("disabled", false);
			value.siblings('input[type="hidden"]').remove();
			if (!value.val() == "null") {
				value.val("");
			}
			if (op.val() != 'range' && !$(elm).data('select2')) {
				self.initialize_select2(elm);
			}
			self.load_field_operators(op, $(elm));
		}
	};

	self.init = function() {
		var rows = $('[data-rules-formset] tr.form-row');
		if (rows.length == 1 && rows.eq(0).hasClass('empty-form')) {
			// if only 1 form and it's empty, add first extra formset
			$('[data-rules-formset] .add-row a').click();
		}
		$('.form-row select.query-operator').each(function() {
			$(this).off("change");
			$(this).data('pre_change', $(this).val());
			$(this).on("change", function() {
				var before_change = $(this).data('pre_change');
				if ($(this).val() != before_change) self.modify_widget(this);
				$(this).data('pre_change', $(this).val());
				self.modify_widget(this);
			}).change();
		});
		$('.form-row.dynamic-form select.query-field').each(function(row) {
			$(this).off("change");
			$(this).data('pre_change', $(this).val());
			$(this).on("change", function() {
				var before_change = $(this).data('pre_change');
				if ($(this).val() != before_change) {
					self.field_selected(this);
				}
				$(this).data('pre_change', $(this).val());
			}).change();
		});
	};

	self.destroy = function() {
		$('.form-row select.query-operator').each(function() {
			$(this).off("change");
			var row = $(this).parents('tr');
			var field = row.find('.query-field');
			var before = $(this).val();
			self.load_field_operators($(this), field);
			$(this).val(before);
		});
		$('.form-row select.query-field').each(function() {
			$(this).off("change");
		});
		$('.form-row input.query-value').each(function() {
			$(this).select2("destroy");
			var id = $(this).attr('id');
			var from_to_input = $(this).parent().find('#' + id + '_from, #' + id + '_to')
			if (from_to_input.length > 0) {
				$(this).css({display: 'none'});
			}
		});
	};
};

// using Grappelli's jquery if available
(function($) {
	$(document).ready(function() {
		if (!_af_handlers) {
			_af_handlers = new OperatorHandlers($);
			_af_handlers.destroy()
			_af_handlers.init();
		}
	});
})(window._jq || jQuery);
