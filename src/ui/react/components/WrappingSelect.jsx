import React, { useMemo } from 'react';
import { Combobox, InputBase, OptionsDropdown, getOptionsLockup, getParsedComboboxData, useCombobox, useProps } from '@mantine/core';
import { useId } from '@mantine/hooks';

// A Mantine Select whose closed field shows a long value on more lines instead of cutting it
// off (large text on a phone). The field is a button with the combobox role, as in Select, so it
// keeps Select's name, keyboard handling and options list; only the value can wrap.
// Safari leaves buttons out of the Tab order by default; Select's field is an input, which it
// keeps, so this one carries tabIndex 0 to stay reachable with Tab there as well.
export default function WrappingSelect({ data, value, onChange, label = '', id = null, className = '', ...others }) {
 // The theme's Select defaults, such as its size, apply here too.
 const { size } = /** @type {{ size: string }} */ (useProps('Select', { size: 'sm' }, {}));
 const options = useMemo(() => getParsedComboboxData(data), [data]);
 const lockup = useMemo(() => getOptionsLockup(options), [options]);
 const fieldId = useId(id);
 const combobox = useCombobox({
  onDropdownOpen: () => combobox.updateSelectedOptionIndex('active', { scrollIntoView: true }),
  onDropdownClose: () => setTimeout(combobox.resetSelectedOption, 0),
 });
 return <Combobox store={combobox} size={size} onOptionSubmit={next => { combobox.closeDropdown(); if (next !== value) onChange(next); }}>
  <Combobox.Target targetType="button" withExpandedAttribute>
   {/* Safari and Firefox on macOS do not focus a button on mousedown and move focus away
       instead, which would close the open list just before the click opens it again.
       The click itself focuses the field. */}
   <InputBase component="button" type="button" tabIndex={0} id={fieldId} label={label} size={size} multiline pointer className={['wrapping-select', className].filter(Boolean).join(' ')} rightSection={<Combobox.Chevron size={size}/>} rightSectionPointerEvents="none" onMouseDown={event => event.preventDefault()} onClick={() => combobox.toggleDropdown()} onBlur={() => combobox.closeDropdown()} {...others}>
    <span className="wrapping-select-value">{lockup[value]?.label}</span>
   </InputBase>
  </Combobox.Target>
  <OptionsDropdown data={options} value={value} withCheckIcon checkIconPosition="left" labelId={label ? `${fieldId}-label` : undefined} aria-label={label ? undefined : others['aria-label']} filter={undefined} search={undefined} limit={undefined} withScrollArea={undefined} maxDropdownHeight={undefined} unstyled={undefined} scrollAreaProps={undefined}/>
 </Combobox>;
}
