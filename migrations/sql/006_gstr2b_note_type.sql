-- CDNR carries both credit and debit notes in one table, and the direction is
-- the whole meaning of the row: a credit note reduces the credit claimable, a
-- debit note increases it. Storing both as positive values in a section called
-- CDNR and leaving the reader to guess would be a sign error waiting to happen
-- in an aggregate.
--
-- Values stay positive and match the file exactly, because the evidence
-- drill-down shows the figure next to the line it came from and the two must
-- agree. The direction travels beside them.

alter table gstr2b_lines
    add column note_type char(1);

alter table gstr2b_lines
    add constraint gstr2b_note_type_vals check (
        note_type is null or note_type in ('C', 'D')
    );

-- A note type only means something on the note sections.
alter table gstr2b_lines
    add constraint gstr2b_note_type_only_on_notes check (
        note_type is null or section in ('CDNR', 'CDNRA', 'B2B_DNR')
    );

comment on column gstr2b_lines.note_type is
    'C = credit note (reduces ITC), D = debit note (increases it). Null elsewhere.';
