import React from "react";
import PageTitle from "@/Components/PageTitle";
import { withAuth } from "@/middlewares";

const Profile = withAuth(() => {
  return (
    <>
      <PageTitle
        title="Profile"
        description="You can manage your profile status from here."
      />
      Soon
    </>
  );
});

export default Profile;
