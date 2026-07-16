"use client";

type DeleteOpportunityButtonProps = {
  className?: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  label?: string;
  opportunityName: string;
};

export function DeleteOpportunityButton({
  className = "action-danger w-full",
  deleteAction,
  label = "Delete Idea",
  opportunityName,
}: DeleteOpportunityButtonProps) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete "${opportunityName}" from opportunities? This will not delete any generated article.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button className={className} type="submit">
        {label}
      </button>
    </form>
  );
}
