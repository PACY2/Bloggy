import PageTitle from "@/Components/PageTitle";
import { useDeleteUserMutation, useGetUsersQuery } from "@/features/apis/userApi";
import { debounce } from "@/helpers";
import useToast from "@/hooks/useToast";
import { IRole, IUser } from "@/index";
import { withAuth } from "@/middlewares";
import { useRouter } from "next/router";
import { ChangeEvent, useState } from "react";
import { Column, Table } from "ui";

const columns: Column<IUser>[] = [
  {
    header: "#",
    accessorKey: "id",
  },
  {
    header: "UserName",
    accessorKey: "username"
  },
  {
    header: "Email Address",
    accessorKey: "email"
  },
  {
    header: "Role",
    accessorKey: "Role",
    cell: ({ getValue }) => {
      const role = getValue<IRole>().name;

      return (
        <div>
          <div className={`text-${role === "admin" ? "red" : "green"}-700 p-2 rounded-md w-fit text-center font-semibold`} >{getValue<IRole>().name}</div>
        </div>
      )

    }
  },
  {
    header: "Created At",
    accessorKey: "createdAt"
  }
];

const Index = withAuth(() => {

  const { t } = useToast()
  const router = useRouter();

  // state
  const [search, setSearch] = useState<string>("")
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 8
  })

  const [deleteUser] = useDeleteUserMutation();
  const { data: users, isLoading } = useGetUsersQuery({
    page: pagination.pageIndex + 1,
    search
  });

  const changeSearch = debounce((v: string) => setSearch(v))

  const handleSearch = (element: ChangeEvent<HTMLInputElement>) => {
    changeSearch(element.target.value)
  }

  const handleDelete = async (id: number) => {
    const response = await deleteUser(id)

    if ("data" in response) {
      t([{
        state: "success",
        title: "User deleted successfully"
      }])
      return
    }

    if ("error" in response) {
      t([{
        state: "danger",
        title: "We clound't delete this user"
      }])
    }
  }

  const handleEdit = (id: number) => {
    router.push(`/dashboard/posts/edit/${id}`)
  }

  return (
    <>
      <PageTitle title="Roles list" description="You can see and manage your roles from here" />
      <Table<IUser>
        handleSearch={handleSearch}
        columns={columns}
        data={users?.data ?? []}
        pageCount={users ? Math.ceil(users.count / users.limit) : 0}
        pagination={pagination}
        setPagination={setPagination}
        isLoading={isLoading}
        handleDelete={handleDelete}
        handleEdit={handleEdit}
      />
    </>
  )
})

export default Index
